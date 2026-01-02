# Yo, this is the Vector DB service - keeping your memories fresh via ChromaDB!
import chromadb
from chromadb.config import Settings
from typing import List, Dict, Any
import os
from datetime import datetime

# Initialize ChromaDB client - the brain of the operation
chroma_client = chromadb.Client(Settings(
    anonymized_telemetry=False,
    allow_reset=True
))

# Get or create collection for messages - keeping it all in one bucket for now
def get_messages_collection():
    """Get or create the messages collection"""
    return chroma_client.get_or_create_collection(
        name="team_messages",
        metadata={"description": "Team chat messages for RAG context"}
    )

def add_message_to_vector_db(message_id: str, content: str, metadata: Dict[str, Any]):
    """
    Add a message to the vector database.
    We just toss it in there and hope for the best!
    
    Args:
        message_id: Unique message identifier
        content: Message content to embed
        metadata: Additional metadata (team_id, sender, timestamp, etc.)
    """
    try:
        collection = get_messages_collection()
        
        # Add document to collection - embedding magic happens automatically
        collection.add(
            documents=[content],
            metadatas=[metadata],
            ids=[message_id]
        )
        
        return True
    except Exception as e:
        # Oops, something went sideways
        print(f"Error adding message to vector DB: {str(e)}")
        return False

def add_messages_batch(messages: List[Dict[str, Any]]):
    """
    Add multiple messages to vector database in batch.
    Efficiency is key, my friend!
    
    Args:
        messages: List of message dictionaries with id, content, and metadata
    """
    try:
        collection = get_messages_collection()
        
        ids = []
        documents = []
        metadatas = []
        
        for msg in messages:
            # We only want text messages, no weird stuff
            if msg.get('content') and msg.get('message_type') == 'text':
                ids.append(msg['message_id'])
                documents.append(msg['content'])
                metadatas.append({
                    'team_id': msg.get('team_id', ''),
                    'sender_name': msg.get('sender_name', 'Unknown'),
                    'sender_id': msg.get('sender_id', ''),
                    'timestamp': msg.get('timestamp', ''),
                    'message_type': msg.get('message_type', 'text')
                })
        
        if ids:
            collection.add(
                documents=documents,
                metadatas=metadatas,
                ids=ids
            )
            
        return len(ids)
    except Exception as e:
        print(f"Error adding messages batch to vector DB: {str(e)}")
        return 0

def search_relevant_context(query: str, team_id: str = None, n_results: int = 5) -> List[Dict[str, Any]]:
    """
    Search for relevant messages based on query.
    This digs up the chat history.
    
    Args:
        query: User's question/query
        team_id: Optional team ID to filter results
        n_results: Number of results to return
        
    Returns:
        List of relevant messages with metadata
    """
    try:
        collection = get_messages_collection()
        
        # Build where filter - gotta stay in your own lane (team)
        where_filter = None
        if team_id:
            # Basic filter: strict match on team_id
            where_filter = {"team_id": team_id}
            # Note: We might want to filter by message_type='text' too, but let's keep it broad for now
        
        # Query the collection - let the vectors do the talking
        results = collection.query(
            query_texts=[query],
            n_results=n_results,
            where=where_filter
        )
        
        # Format results - making it look pretty for the LLM
        context_messages = []
        if results and results['documents'] and len(results['documents']) > 0:
            for i, doc in enumerate(results['documents'][0]):
                metadata = results['metadatas'][0][i] if results['metadatas'] else {}
                distance = results['distances'][0][i] if results['distances'] else 0
                
                context_messages.append({
                    'content': doc,
                    'sender_name': metadata.get('sender_name', 'Unknown'),
                    'timestamp': metadata.get('timestamp', ''),
                    'team_id': metadata.get('team_id', ''),
                    'message_type': metadata.get('message_type', 'text'),
                    'relevance_score': 1 - distance  # Convert distance to similarity score
                })
        
        return context_messages
    except Exception as e:
        print(f"Error searching vector DB: {str(e)}")
        return []

def search_knowledge_base(query: str, team_id: str = None, n_results: int = 3) -> List[Dict[str, Any]]:
    """
    Search for project knowledge and code snippets.
    This is the "smart" part of the RAG, looking for facts and code.
    
    Args:
        query: User's question
        team_id: Optional team ID
        n_results: Max results
    """
    try:
        collection = get_messages_collection()
        
        where_filter = {}
        if team_id:
             where_filter["team_id"] = team_id
        
        # Construct a complex filter if possible, but Chroma's simple filter is... simple.
        # We want: (team_id == X) AND (message_type IN ['project_info', 'code_snippet'])
        # Since Chroma simple filtering is limited, we'll fetch a bit more and filter in Python if needed,
        # OR we rely on the fact that if we search for "project info", we probably get it.
        # BUT, to be safe, let's just search and filter the results.
        # Actually, Chroma supports $or operator in newer versions, but let's stick to safe simple filtering.
        # We will iterate 2 searches or just doing a broad search?
        # Let's try searching specifically for types if we can.
        # Wait, current Chroma version support for $in:
        # where={"message_type": {"$in": ["project_info", "code_snippet"]}}
        # Let's assume standard Chroma support.
        
        # Let's try to compel it to look for knowledge
        # Since we can't easily do "OR" with "AND team_id" in simple dicts without potentially newer syntax,
        # We will just search everything for this specific intent and filter types in post-processing if needed.
        # However, to prioritize, we can try to filter by metadata if we know how.
        
        # Let's just do a search restricted to the team, and we'll check the types.
        # But wait, search_relevant_context already does that.
        # The goal here is to SPECIFICALLY fetch knowledge, maybe boosting it?
        # Let's try an explicit filter for message_type != text if possible?
        # "message_type": {"$ne": "text"}
        
        knowledge_filter = {}
        if team_id:
            knowledge_filter["team_id"] = team_id
            
        # Try to filter out regular chat if possible to dig for gold
        # knowledge_filter["message_type"] = {"$ne": "text"} # Uncomment if Chroma supports this widely, else risk error.
        # Safest bet: Just query, but we increase n_results and filter in python.
        
        results = collection.query(
            query_texts=[query],
            n_results=n_results * 2, # Fetch more to filter
            where=knowledge_filter
        )
        
        knowledge_items = []
        if results and results['documents']:
            for i, doc in enumerate(results['documents'][0]):
                metadata = results['metadatas'][0][i]
                msg_type = metadata.get('message_type', 'text')
                
                # We specifically want non-chat stuff here
                if msg_type in ['project_info', 'code_snippet']:
                    knowledge_items.append({
                        'content': doc,
                        'type': msg_type,
                        'metadata': metadata,
                        'relevance': 1 - (results['distances'][0][i] if results['distances'] else 0)
                    })
        
        # Return top N after filtering
        return knowledge_items[:n_results]

    except Exception as e:
        print(f"Error searching knowledge base: {str(e)}")
        return []

def delete_team_messages(team_id: str):
    """
    Delete all messages for a specific team.
    Nuke it from orbit, it's the only way to be sure.
    """
    try:
        collection = get_messages_collection()
        
        # Get all IDs for this team
        results = collection.get(
            where={"team_id": team_id}
        )
        
        if results and results['ids']:
            collection.delete(ids=results['ids'])
            return len(results['ids'])
        
        return 0
    except Exception as e:
        print(f"Error deleting team messages from vector DB: {str(e)}")
        return 0

def get_collection_stats():
    """Get statistics about the vector database"""
    try:
        collection = get_messages_collection()
        count = collection.count()
        
        return {
            "total_messages": count,
            "collection_name": "team_messages"
        }
    except Exception as e:
        print(f"Error getting collection stats: {str(e)}")
        return {"total_messages": 0, "collection_name": "team_messages"}
