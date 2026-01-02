from app.config import db
from typing import List, Dict, Any, Optional
from datetime import datetime

def create_document(collection_name: str, doc_id: str, data: dict):
    """Create a new document in Firestore"""
    if db is None:
        raise Exception("Firestore not configured")
    db.collection(collection_name).document(doc_id).set(data)
    return data

def get_document(collection_name: str, doc_id: str) -> Optional[Dict[str, Any]]:
    """Get a single document from Firestore"""
    if db is None:
        raise Exception("Firestore not configured")
    doc_ref = db.collection(collection_name).document(doc_id)
    doc = doc_ref.get()
    if doc.exists:
        return doc.to_dict()
    return None

def get_collection(collection_name: str) -> List[Dict[str, Any]]:
    """Get all documents from a collection"""
    if db is None:
        raise Exception("Firestore not configured")
    docs = db.collection(collection_name).stream()
    result = []
    for doc in docs:
        data = doc.to_dict()
        if "id" not in data:
            data["id"] = doc.id
        result.append(data)
    return result

def update_document(collection_name: str, doc_id: str, data: dict):
    """Update a document in Firestore"""
    if db is None:
        raise Exception("Firestore not configured")
    data["updated_at"] = datetime.utcnow()
    db.collection(collection_name).document(doc_id).update(data)
    return data

def delete_document(collection_name: str, doc_id: str):
    """Delete a document from Firestore"""
    if db is None:
        raise Exception("Firestore not configured")
    db.collection(collection_name).document(doc_id).delete()
    return True

def query_collection(collection_name: str, field: str, operator: str, value: Any) -> List[Dict[str, Any]]:
    """Query a collection with a specific condition"""
    if db is None:
        raise Exception("Firestore not configured")
    
    docs = db.collection(collection_name).where(field, operator, value).stream()
    return [doc.to_dict() for doc in docs]


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Get user by email address from Firestore"""
    try:
        users = query_collection("users", "email", "==", email)
        if not users:
            return None
        
        user = users[0]
        # Ensure 'userId' exists in the returned document
        if "userId" not in user:
            user["userId"] = user.get("uid") or user.get("id")  # fallback
        return user
    except Exception as e:
        print(f"Error fetching user by email {email}: {e}")
        return None


def get_team_messages(team_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Get messages for a specific team, ordered by creation time"""
    if db is None:
        raise Exception("Firestore not configured")
    try:
        messages_ref = db.collection("messages").where("teamId", "==", team_id)
        messages_ref = messages_ref.order_by("created_at", direction="DESCENDING").limit(limit)
        docs = messages_ref.stream()
        messages = [doc.to_dict() for doc in docs]
        # Sort in ascending order (oldest first) for chat display
        return list(reversed(messages))
    except Exception as e:
        print(f"Error fetching messages: {e}")
        # If index doesn't exist or other error, try without ordering
        try:
            messages_ref = db.collection("messages").where("teamId", "==", team_id).limit(limit)
            docs = messages_ref.stream()
            return [doc.to_dict() for doc in docs]
        except Exception as e2:
            print(f"Error fetching messages without order: {e2}")
            return []

def get_user_teams(user_id: str) -> List[Dict[str, Any]]:
    """Get all teams a user is a member of"""
    if db is None:
        raise Exception("Firestore not configured")
    teams_ref = db.collection("teams")
    docs = teams_ref.stream()
    user_teams = []
    for doc in docs:
        team_data = doc.to_dict()
        # Check if user is admin or member
        if (team_data.get("admin_id") == user_id or 
            any(member.get("user_id") == user_id for member in team_data.get("members", []))):
            user_teams.append(team_data)
    return user_teams

def add_team_member(team_id: str, member_data: Dict[str, Any]):
    """Add a member to a team"""
    if db is None:
        raise Exception("Firestore not configured")
    team_ref = db.collection("teams").document(team_id)
    team_doc = team_ref.get()
    
    if team_doc.exists:
        team_data = team_doc.to_dict()
        members = team_data.get("members", [])
        
        # Check if member already exists
        if not any(member.get("user_id") == member_data["user_id"] for member in members):
            members.append(member_data)
            team_ref.update({"members": members, "updated_at": datetime.utcnow()})
            return True
    return False

def remove_team_member(team_id: str, user_id: str):
    """Remove a member from a team"""
    if db is None:
        raise Exception("Firestore not configured")
    team_ref = db.collection("teams").document(team_id)
    team_doc = team_ref.get()
    
    if team_doc.exists:
        team_data = team_doc.to_dict()
        members = team_data.get("members", [])
        
        # Remove member
        members = [member for member in members if member.get("user_id") != user_id]
        team_ref.update({"members": members, "updated_at": datetime.utcnow()})
        return True
    return False

# Todo-related functions
def create_todo(todo_id: str, todo_data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new todo in Firestore"""
    if db is None:
        raise Exception("Firestore not configured")
    db.collection("todos").document(todo_id).set(todo_data)
    return todo_data

def get_todo(todo_id: str) -> Optional[Dict[str, Any]]:
    """Get a single todo by ID"""
    return get_document("todos", todo_id)

def get_team_todos(team_id: str) -> List[Dict[str, Any]]:
    """Get all todos for a specific team"""
    if db is None:
        raise Exception("Firestore not configured")
    try:
        todos_ref = db.collection("todos").where("team_id", "==", team_id)
        todos_ref = todos_ref.order_by("created_at", direction="DESCENDING")
        docs = todos_ref.stream()
        return [doc.to_dict() for doc in docs]
    except Exception as e:
        print(f"Error fetching todos: {e}")
        # Fallback without ordering if index doesn't exist
        try:
            todos_ref = db.collection("todos").where("team_id", "==", team_id)
            docs = todos_ref.stream()
            return [doc.to_dict() for doc in docs]
        except Exception as e2:
            print(f"Error fetching todos without order: {e2}")
            return []

def get_user_todos(user_email: str) -> List[Dict[str, Any]]:
    """Get all todos assigned to a specific user"""
    if db is None:
        raise Exception("Firestore not configured")
    try:
        todos_ref = db.collection("todos")
        docs = todos_ref.stream()
        user_todos = []
        for doc in docs:
            todo_data = doc.to_dict()
            # Check if user is assigned to this todo
            assigned_users = todo_data.get("assigned_users", [])
            if any(user.get("email") == user_email for user in assigned_users):
                user_todos.append(todo_data)
        return user_todos
    except Exception as e:
        print(f"Error fetching user todos: {e}")
        return []

def delete_todo(todo_id: str) -> bool:
    """Delete a todo from Firestore"""
    return delete_document("todos", todo_id)
