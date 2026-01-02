import google.generativeai as genai
from typing import List, Dict, Any, Optional
from datetime import datetime
import os
import uuid
from dotenv import load_dotenv
from app.services.vector_db_service import search_relevant_context, add_messages_batch
from app.services.firestore_service import get_team_messages
from app.config import db

# Load environment variables
load_dotenv()

GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY_SUMMARY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

class AssistantService:
    """AI Assistant service using Gemini and ChromaDB for RAG"""
    
    def __init__(self):
        """Initialize the assistant service"""
        if not GEMINI_API_KEY:
            print("Warning: GEMINI_API_KEY not found")
        # Store conversation history per user AND per project
        # Format: {"user_id:project_id": [messages]}
        self.conversation_history = {}
    
    def _get_history_key(self, user_id: str, project_id: Optional[str] = None) -> str:
        """Generate a unique key for conversation history"""
        return f"{user_id}:{project_id or 'general'}"
    
    def get_conversation_history(self, user_id: str, project_id: Optional[str] = None) -> List[Dict[str, str]]:
        """Get conversation history for a user in a specific project"""
        history_key = self._get_history_key(user_id, project_id)
        if history_key not in self.conversation_history:
            # Try to load from Firestore
            self.conversation_history[history_key] = self._load_history_from_firestore(user_id, project_id)
        return self.conversation_history[history_key]
    
    def add_to_history(self, user_id: str, role: str, content: str, project_id: Optional[str] = None):
        """Add a message to conversation history and persist to Firestore"""
        history_key = self._get_history_key(user_id, project_id)
        if history_key not in self.conversation_history:
            self.conversation_history[history_key] = []
        
        message_data = {
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat()
        }
        
        self.conversation_history[history_key].append(message_data)
        
        # Keep only last 20 messages to avoid token limits
        if len(self.conversation_history[history_key]) > 20:
            self.conversation_history[history_key] = self.conversation_history[history_key][-20:]
        
        # Persist to Firestore
        self._save_message_to_firestore(user_id, project_id, message_data)
    
    def clear_history(self, user_id: str, project_id: Optional[str] = None):
        """Clear conversation history for a user in a specific project"""
        history_key = self._get_history_key(user_id, project_id)
        if history_key in self.conversation_history:
            self.conversation_history[history_key] = []
        
        # Clear from Firestore
        self._clear_history_from_firestore(user_id, project_id)
    
    async def generate_response(
        self,
        user_id: str,
        message: str,
        project_context: Optional[str] = None,
        use_rag: bool = True
    ) -> Dict[str, Any]:
        """
        Generate AI response using Gemini with RAG (Retrieval Augmented Generation).
        This is where the magic happens!
        
        Args:
            user_id: User identifier
            message: User's message
            project_context: Optional project/team context identifier
            use_rag: Whether to use RAG with vector database
            
        Returns:
            Dictionary with response and metadata
        """
        try:
            if not GEMINI_API_KEY:
                raise Exception("GEMINI_API_KEY not configured")
            
            # Initialize Gemini model - time to wake up the beast
            model = genai.GenerativeModel('gemini-2.5-flash-lite')
            
            # Get conversation history for this specific project
            # Gotta know what we were talking about
            history = self.get_conversation_history(user_id, project_context)
            
            # Retrieve relevant context from vector DB if RAG is enabled
            context_messages = []
            knowledge_items = []
            retrieved_sources = []
            
            # Build context from RAG
            context_data = ""
            if use_rag:
                team_messages = []
                if project_context:
                    team_messages = get_team_messages(project_context)

                # Search for relevant messages from the team (or all teams if no context)
                # This searches ALL users' messages in the team, not just current user
                print(f"🔍 Searching vector DB for: '{message}' in team: {project_context}")
                
                # Fetch chat history - "Who said what?"
                # Importing explicitly to avoid circular import issues if module level is messy
                from app.services.vector_db_service import search_relevant_context, search_knowledge_base
                
                context_messages = search_relevant_context(
                    query=message,
                    team_id=project_context,  # If None, searches across all teams
                    n_results=10  # Increased to get more context from all users
                )
                
                # Fetch Project Documentation and Code - "How does this actually work?"
                knowledge_items = search_knowledge_base(
                    query=message,
                    team_id=project_context,
                    n_results=3
                )
                
                print(f"📊 Found {len(context_messages)} relevant messages and {len(knowledge_items)} knowledge items")
                
                # Format sources for response and build context
                context_parts = []
                
                if context_messages:
                    context_parts.append("\n**Relevant Team Messages:**")
                    for i, msg in enumerate(context_messages, 1):
                        sender = msg.get("sender_name", "Unknown")
                        content = msg.get("content", "")
                        timestamp = msg.get("timestamp", "")
                
                        retrieved_sources.append({
                            "type": "chat",
                            "sender": sender,
                            "content": content[:100] + "..." if len(content) > 100 else content,
                            "timestamp": timestamp,
                            "relevance": round(msg.get("relevance_score", 0), 2),
                        })
                
                        # Include full context for better AI understanding
                        context_parts.append(f"{i}. [{sender}] ({timestamp}): {content[:500]}")
                
                if knowledge_items:
                    context_parts.append("\n**Relevant Project Knowledge & Code:**")
                    for i, item in enumerate(knowledge_items, 1):
                        content = item.get("content", "")
                        meta = item.get("metadata", {})
                        k_type = item.get("type", "info")
                        
                        retrieved_sources.append({
                            "type": k_type,
                            "sender": "System",
                            "content": f"[{k_type}] {content[:100]}...",
                            "timestamp": meta.get("timestamp", ""),
                            "relevance": round(item.get("relevance", 0), 2)
                        })
                        
                        context_parts.append(f"[{k_type.upper()}] {content[:1000]}")

                if context_parts:
                    context_data = "\n".join(context_parts)
                else:
                    context_data = "No relevant context found."
                
                # Build the system prompt
                # Giving the AI a chill but professional persona
                system_prompt = """You are ThinkBuddy — an intelligent AI assistant.
                
                You are helpful, concise, and provide actionable insights.
                
                IMPORTANT:
                You have access to:
                1. Team Chat Logs: Messages from ALL team members. Use these to understand the discussion history.
                2. Project Knowledge: Facts and descriptions about the project.
                3. Code Snippets: Actual code from the project.

                When answering:
                - Synthesize information from ALL sources.
                - If the user asks about code, look at the Code Snippets.
                - If the user asks about project status, look at Chat Logs and Project Knowledge.
                - Be specific, citing who said what if relevant.
                """
                
                # Format recent conversation history (limit to last 5 messages)
                history_text = ""
                if history:
                    history_text = "\n**Recent Conversation:**\n"
                    for msg in history[-5:]:
                        role = "User" if msg["role"] == "user" else "Assistant"
                        history_text += f"{role}: {msg['content']}\n"
                
                # Build team context from messages - just a glimpse of recent chatter
                team_context = ""
                if team_messages:
                    team_context = "\n".join([
                        f"[{msg.get('sender_name', 'Unknown')}]: {msg.get('content', '')[:200]}"
                        for msg in team_messages[:20]
                    ])
                
                # Build the final prompt for the AI model
                full_prompt = f"""
                {system_prompt}
                
                **Recent Team Activity (Last 20 messages):**
                {team_context if team_context else "No recent messages."}
                
                **Retrieved Context (RAG):**
                {context_data}
                
                {history_text}
                
                **User Question:** {message}
                
                **Your Response:**
                """
            else:
                # Simple prompt without RAG - flying blind!
                system_prompt = """You are ThinkBuddy — an intelligent AI assistant.
                You are helpful, concise, and provide actionable insights."""
                
                # Format recent conversation history
                history_text = ""
                if history:
                    history_text = "\n**Recent Conversation:**\n"
                    for msg in history[-5:]:
                        role = "User" if msg["role"] == "user" else "Assistant"
                        history_text += f"{role}: {msg['content']}\n"
                
                full_prompt = f"""
                {system_prompt}
                
                {history_text}
                
                **User Question:** {message}
                
                **Your Response:**
                """

            # Generate response with Gemini
            response = model.generate_content(full_prompt)
            
            if not response or not response.text:
                raise Exception("Gemini returned empty response")
            
            assistant_response = response.text.strip()
            
            # Add to conversation history for this specific project
            self.add_to_history(user_id, "user", message, project_context)
            self.add_to_history(user_id, "assistant", assistant_response, project_context)
            
            return {
                "response": assistant_response,
                "sources": retrieved_sources if use_rag else [],
                "timestamp": datetime.now().isoformat(),
                "project_context": project_context or "general"
            }
            
        except Exception as e:
            print(f"Error generating response: {str(e)}")
            raise Exception(f"Failed to generate response: {str(e)}")
    
    def add_project_knowledge(
        self,
        project_id: str,
        project_name: str,
        description: str,
        additional_info: Dict[str, Any] = None
    ) -> bool:
        """Add project knowledge to the vector database"""
        try:
            content = f"""Project: {project_name}
Description: {description}
{f"Additional Info: {additional_info}" if additional_info else ""}"""
            
            # Add to vector database
            from app.services.vector_db_service import add_message_to_vector_db
            return add_message_to_vector_db(
                message_id=f"project_{project_id}",
                content=content,
                metadata={
                    "team_id": project_id,
                    "sender_name": "System",
                    "message_type": "project_info",
                    "project_name": project_name,
                    "timestamp": datetime.now().isoformat(),
                    **(additional_info or {})
                }
            )
        except Exception as e:
            print(f"Error adding project knowledge: {str(e)}")
            return False
    
    def add_code_knowledge(
        self,
        code_id: str,
        code: str,
        language: str,
        description: str,
        project_id: Optional[str] = None
    ) -> bool:
        """Add code snippet to the knowledge base"""
        try:
            content = f"""Code Snippet ({language}):
{description}

```{language}
{code}
```"""
            
            from app.services.vector_db_service import add_message_to_vector_db
            return add_message_to_vector_db(
                message_id=f"code_{code_id}",
                content=content,
                metadata={
                    "team_id": project_id or "general",
                    "sender_name": "System",
                    "message_type": "code_snippet",
                    "language": language,
                    "timestamp": datetime.now().isoformat()
                }
            )
        except Exception as e:
            print(f"Error adding code knowledge: {str(e)}")
            return False
    
    def _load_history_from_firestore(self, user_id: str, project_id: Optional[str] = None) -> List[Dict[str, str]]:
        """Load conversation history from Firestore"""
        try:
            if db is None:
                return []
            
            project_key = project_id or "general"
            history_ref = db.collection("thinkbuddy_chats").document(f"{user_id}_{project_key}")
            doc = history_ref.get()
            
            if doc.exists:
                data = doc.to_dict()
                return data.get("messages", [])
            return []
        except Exception as e:
            print(f"Error loading history from Firestore: {str(e)}")
            return []
    
    def _save_message_to_firestore(self, user_id: str, project_id: Optional[str], message_data: Dict[str, str]):
        """Save a single message to Firestore"""
        try:
            if db is None:
                return
            
            project_key = project_id or "general"
            doc_id = f"{user_id}_{project_key}"
            history_ref = db.collection("thinkbuddy_chats").document(doc_id)
            
            # Get existing document
            doc = history_ref.get()
            
            if doc.exists:
                # Append to existing messages
                history_ref.update({
                    "messages": db.field_value.ArrayUnion([message_data]),
                    "updated_at": datetime.now().isoformat(),
                    "last_message_at": datetime.now().isoformat()
                })
            else:
                # Create new document
                history_ref.set({
                    "user_id": user_id,
                    "project_id": project_key,
                    "messages": [message_data],
                    "created_at": datetime.now().isoformat(),
                    "updated_at": datetime.now().isoformat(),
                    "last_message_at": datetime.now().isoformat()
                })
        except Exception as e:
            print(f"Error saving message to Firestore: {str(e)}")
    
    def _clear_history_from_firestore(self, user_id: str, project_id: Optional[str] = None):
        """Clear conversation history from Firestore"""
        try:
            if db is None:
                return
            
            project_key = project_id or "general"
            doc_id = f"{user_id}_{project_key}"
            history_ref = db.collection("thinkbuddy_chats").document(doc_id)
            
            # Update to empty messages array
            history_ref.update({
                "messages": [],
                "updated_at": datetime.now().isoformat()
            })
        except Exception as e:
            print(f"Error clearing history from Firestore: {str(e)}")
    
    def get_all_project_chats(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all ThinkBuddy chat sessions for a user across all projects"""
        try:
            if db is None:
                return []
            
            # Query all chats for this user
            chats_ref = db.collection("thinkbuddy_chats").where("user_id", "==", user_id)
            docs = chats_ref.stream()
            
            chats = []
            for doc in docs:
                data = doc.to_dict()
                chats.append({
                    "project_id": data.get("project_id"),
                    "message_count": len(data.get("messages", [])),
                    "last_message_at": data.get("last_message_at"),
                    "created_at": data.get("created_at")
                })
            
            return chats
        except Exception as e:
            print(f"Error getting all project chats: {str(e)}")
            return []

# Global instance
assistant_service = AssistantService()
