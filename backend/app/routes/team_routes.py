from fastapi import APIRouter, HTTPException, Depends, status
from datetime import datetime, timedelta
from typing import List
from app.models.teams import Team, TeamCreate, TeamUpdate, TeamMember, TeamInvite
from app.services.firestore_service import (
    create_document, get_document, get_collection, update_document, 
    delete_document, get_user_by_email, add_team_member, remove_team_member
)
from app.dependencies.auth import get_current_user
import uuid

router = APIRouter(prefix="/teams", tags=["teams"])

# Helper: Ensure Firestore user exists
def ensure_user_in_firestore(user: dict):
    """Create a Firestore user document if it does not exist."""
    user_doc = get_user_by_email(user["email"])
    if not user_doc:
        create_document("users", user["uid"], {
            "userId": user["uid"],
            "email": user["email"],
            "name": user.get("name", user["email"].split("@")[0]),
            "myTeams": []
        })
        user_doc = get_user_by_email(user["email"])
    return user_doc

# -----------------------
# Team CRUD Routes
# -----------------------

@router.post("/", response_model=Team)
async def create_team(
    team_data: TeamCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new team"""
    team_id = str(uuid.uuid4())
    admin_email = current_user.get("email")
    admin_id = current_user.get("uid")
    
    # Get or create admin user info
    admin_user = get_user_by_email(admin_email)
    if not admin_user:
        # Auto-create user profile if it doesn't exist
        admin_user = {
            "userId": admin_id,
            "name": current_user.get("name", admin_email.split("@")[0]),
            "email": admin_email,
            "myTeams": [],
            "created_at": datetime.utcnow()
        }
        create_document("users", admin_id, admin_user)
    
    # Create team members list starting with admin
    members = [TeamMember(
        user_id=admin_id,
        email=admin_email,
        name=admin_user.get("name", admin_email.split("@")[0]),
        role="admin",
        joined_at=datetime.utcnow()
    )]

    # Create the team with only admin member initially
    team = Team(
        teamId=team_id,
        admin_id=admin_id,
        admin_email=admin_email,
        teamName=team_data.teamName,
        description=team_data.description,
        members=members,
        created_at=datetime.utcnow()
    )
    create_document("teams", team_id, team.dict())

    # Send invites to other members
    for member_email in team_data.member_emails:
        if member_email != admin_email:
            # Check if user already exists
            member_user = get_user_by_email(member_email)
            
            invite_id = str(uuid.uuid4())
            invite = TeamInvite(
                team_id=team_id,
                team_name=team_data.teamName,
                inviter_email=admin_email,
                inviter_name=admin_user.get("name", admin_email.split("@")[0]),
                invitee_email=member_email,
                role="member",
                status="pending",
                created_at=datetime.utcnow(),
                expires_at=datetime.utcnow() + timedelta(days=7)
            )
            create_document("team_invites", invite_id, invite.dict())

    # Update admin user's team list
    admin_teams = admin_user.get("myTeams", [])
    if team_id not in admin_teams:
        admin_teams.append(team_id)
        update_document("users", admin_id, {"myTeams": admin_teams})

    return team

@router.get("/", response_model=List[Team])
async def get_user_teams(current_user: dict = Depends(get_current_user)):
    """Get all teams for the current user"""
    user_id = current_user.get("uid")
    teams = get_collection("teams") or []
    user_teams = [
        team for team in teams
        if team.get("admin_id") == user_id or
           any(member.get("user_id") == user_id for member in team.get("members", []))
    ]
    return user_teams

@router.get("/{team_id}", response_model=Team)
async def get_team(team_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific team by ID"""
    team = get_document("teams", team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    user_id = current_user.get("uid")
    if team.get("admin_id") != user_id and \
       not any(member.get("user_id") == user_id for member in team.get("members", [])):
        raise HTTPException(status_code=403, detail="Access denied")
    
    return team

@router.put("/{team_id}", response_model=Team)
async def update_team(
    team_id: str,
    team_update: TeamUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update team information (admin only)"""
    team = get_document("teams", team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    user_id = current_user.get("uid")
    if team.get("admin_id") != user_id:
        raise HTTPException(status_code=403, detail="Only team admin can update team")
    
    update_data = team_update.dict(exclude_unset=True)
    if update_data:
        update_document("teams", team_id, update_data)
        team.update(update_data)
    
    return team

# -----------------------
# Team Members
# -----------------------

@router.post("/{team_id}/members")
async def add_member_to_team(
    team_id: str,
    member_email: str,
    current_user: dict = Depends(get_current_user)
):
    """Add a member to the team by email"""
    team = get_document("teams", team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    user_id = current_user.get("uid")
    if team.get("admin_id") != user_id:
        raise HTTPException(status_code=403, detail="Only team admin can add members")
    
    if any(member.get("email") == member_email for member in team.get("members", [])):
        raise HTTPException(status_code=400, detail="Member already exists")
    
    member_user = get_user_by_email(member_email)
    if not member_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    member_data = {
        "user_id": member_user["userId"],
        "email": member_email,
        "name": member_user.get("name", member_email.split("@")[0]),
        "role": "member",
        "joined_at": datetime.utcnow()
    }
    
    success = add_team_member(team_id, member_data)
    if success:
        member_teams = member_user.get("myTeams", [])
        if team_id not in member_teams:
            member_teams.append(team_id)
            update_document("users", member_user["userId"], {"myTeams": member_teams})
        return {"message": "Member added successfully"}
    
    raise HTTPException(status_code=500, detail="Failed to add member")

@router.delete("/{team_id}/members/{member_id}")
async def remove_member_from_team(
    team_id: str,
    member_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Remove a member from the team"""
    team = get_document("teams", team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    user_id = current_user.get("uid")
    if team.get("admin_id") != user_id:
        raise HTTPException(status_code=403, detail="Only team admin can remove members")
    
    if member_id == user_id:
        raise HTTPException(status_code=400, detail="Admin cannot remove themselves")
    
    success = remove_team_member(team_id, member_id)
    if success:
        member_user = get_document("users", member_id)
        if member_user:
            member_teams = member_user.get("myTeams", [])
            if team_id in member_teams:
                member_teams.remove(team_id)
                update_document("users", member_id, {"myTeams": member_teams})
        return {"message": "Member removed successfully"}
    
    raise HTTPException(status_code=500, detail="Failed to remove member")

# -----------------------
# Team Invitations
# -----------------------

@router.post("/{team_id}/invite")
async def invite_user_to_team(
    team_id: str,
    invitee_email: str,
    current_user: dict = Depends(get_current_user)
):
    """Invite a user to join the team"""
    team = get_document("teams", team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    user_id = current_user.get("uid")
    if team.get("admin_id") != user_id:
        raise HTTPException(status_code=403, detail="Only team admin can send invitations")
    
    if any(member.get("email") == invitee_email for member in team.get("members", [])):
        raise HTTPException(status_code=400, detail="User is already a member")
    
    invite_id = str(uuid.uuid4())
    invite = TeamInvite(
        team_id=team_id,
        team_name=team.get("teamName", "Unknown Team"),
        inviter_email=current_user.get("email"),
        inviter_name=current_user.get("name", current_user.get("email").split("@")[0]),
        invitee_email=invitee_email,
        role="member",
        status="pending",
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(days=7)
    )
    
    create_document("team_invites", invite_id, invite.dict())
    return {"message": "Invitation sent successfully", "invite_id": invite_id}

@router.get("/invites/my", response_model=List[dict])
async def get_my_invites(current_user: dict = Depends(get_current_user)):
    """Get all pending invites for the current user"""
    user_email = current_user.get("email")
    all_invites = get_collection("team_invites") or []
    
    my_invites = [
        invite for invite in all_invites
        if invite.get("invitee_email") == user_email and invite.get("status") == "pending"
    ]
    return my_invites

@router.post("/invites/{invite_id}/accept")
async def accept_invite(invite_id: str, current_user: dict = Depends(get_current_user)):
    """Accept a team invitation"""
    invite = get_document("team_invites", invite_id)
    if not invite:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    if invite.get("invitee_email") != current_user.get("email"):
        raise HTTPException(status_code=403, detail="This invitation is not for you")
    
    if invite.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Invitation is no longer valid")
    
    team_id = invite.get("team_id")
    team = get_document("teams", team_id)
    if not team:
        # If team no longer exists, just expire the invite
        update_document("team_invites", invite_id, {"status": "expired"})
        raise HTTPException(status_code=404, detail="Team no longer exists")
    
    # Check if already a member
    user_id = current_user.get("uid")
    if any(member.get("user_id") == user_id for member in team.get("members", [])):
        # Already member, just update invite status
        update_document("team_invites", invite_id, {"status": "accepted"})
        return {"message": "You are already a member of this team"}
    
    # Add user to team
    # Ensure user has a profile in our DB first
    ensure_user_in_firestore(current_user)
    user_doc = get_user_by_email(current_user.get("email"))

    member_data = {
        "user_id": user_doc["userId"],
        "email": user_doc["email"],
        "name": user_doc.get("name", user_doc["email"].split("@")[0]),
        "role": invite.get("role", "member"),
        "joined_at": datetime.utcnow()
    }
    
    success = add_team_member(team_id, member_data)
    if success:
        # Update user's myTeams
        member_teams = user_doc.get("myTeams", [])
        if team_id not in member_teams:
            member_teams.append(team_id)
            update_document("users", user_doc["userId"], {"myTeams": member_teams})
        
        # Update invite status
        update_document("team_invites", invite_id, {"status": "accepted"})
        return {"message": "Joined team successfully", "team_id": team_id}
    
    raise HTTPException(status_code=500, detail="Failed to join team")

@router.post("/invites/{invite_id}/reject")
async def reject_invite(invite_id: str, current_user: dict = Depends(get_current_user)):
    """Reject a team invitation"""
    invite = get_document("team_invites", invite_id)
    if not invite:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    if invite.get("invitee_email") != current_user.get("email"):
        raise HTTPException(status_code=403, detail="This invitation is not for you")
    
    update_document("team_invites", invite_id, {"status": "declined"})
    return {"message": "Invitation declined"}

# -----------------------
# Delete Team
# -----------------------

@router.delete("/{team_id}")
async def delete_team(team_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a team (admin only)"""
    team = get_document("teams", team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    user_id = current_user.get("uid")
    if team.get("admin_id") != user_id:
        raise HTTPException(status_code=403, detail="Only team admin can delete team")
    
    # Remove team from all members' myTeams
    for member in team.get("members", []):
        member_user = get_document("users", member["user_id"])
        if member_user:
            member_teams = member_user.get("myTeams", [])
            if team_id in member_teams:
                member_teams.remove(team_id)
                update_document("users", member["user_id"], {"myTeams": member_teams})
    
    delete_document("teams", team_id)
    return {"message": "Team deleted successfully"}
