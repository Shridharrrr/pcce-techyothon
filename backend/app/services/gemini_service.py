import google.generativeai as genai
import os
from dotenv import load_dotenv
from typing import List, Dict, Any

# Load environment variables
load_dotenv()

GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY_SUMMARY")

# Configure Gemini
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

def generate_summary_from_messages(messages: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Generate a summary directly from chat messages using Gemini
    
    Args:
        messages: List of message dictionaries with 'content', 'sender_name', etc.
        
    Returns:
        Dictionary with summary and metadata
    """
    if not GEMINI_API_KEY:
        raise Exception("GEMINI_API_KEY not found in environment variables")
    
    if not messages:
        raise Exception("No messages to summarize")
    
    # Extract statistics
    total_messages = len(messages)
    text_messages = [m for m in messages if m.get('message_type') == 'text']
    text_messages_count = len(text_messages)
    unique_senders = set(m.get('sender_name', 'Unknown') for m in messages)
    participants = list(unique_senders)
    participant_count = len(unique_senders)
    
    # Format messages for Gemini
    chat_text = "\n".join([
        f"{msg.get('sender_name', 'Unknown')}: {msg.get('content', '')}"
        for msg in text_messages
        if msg.get('content')
    ])
    
    if not chat_text.strip():
        raise Exception("No text messages to summarize")
    
    # Limit input text length
    max_input_chars = 10000
    if len(chat_text) > max_input_chars:
        chat_text = chat_text[:max_input_chars] + "..."
    
    try:
        # Initialize Gemini model
        model = genai.GenerativeModel('gemini-2.5-flash-lite')
        
        # Create a detailed prompt for Gemini
        prompt = f"""You are an expert at summarizing team conversations. 

Please analyze the following team chat conversation and create a comprehensive summary.

Conversation:
{chat_text}

Context:
- Total Messages: {total_messages}
- Participants: {', '.join(participants)}
- Text Messages: {text_messages_count}

Your Task:
1. Create a concise summary (2-3 sentences) highlighting the main discussion points
2. Identify key decisions or action items if any
3. Note any important topics or concerns raised
4. Keep it professional and clear

Please provide the summary in a structured format:

Summary: [Your concise overview]

Important decisions made in the conversation:
- [Decision 1]
- [Decision 2 if exist]

"""
    
        # Generate content with Gemini
        response = model.generate_content(prompt)
        
        if not response or not response.text:
            raise Exception("Gemini returned empty response")
        
        return {
            "summary": response.text.strip(),
            "total_messages": total_messages,
            "text_messages_count": text_messages_count,
            "participants": participants,
            "participant_count": participant_count
        }
            
    except Exception as e:
        print(f"Error calling Gemini API: {str(e)}")
        raise Exception(f"Failed to generate summary with Gemini: {str(e)}")
