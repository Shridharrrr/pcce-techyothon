from pydantic import BaseModel, EmailStr
from typing import List, Optional
from datetime import datetime

class TeamBase(BaseModel):
    teamName: str
    description: Optional[str] = None

class TeamCreate(TeamBase):
    member_emails: List[EmailStr] = []

class TeamUpdate(BaseModel):
    teamName: Optional[str] = None
    description: Optional[str] = None

class TeamMember(BaseModel):
    user_id: str
    email: str
    name: str
    role: str = "member"  # member, admin
    joined_at: datetime

class Team(TeamBase):
    teamId: str
    admin_id: str
    admin_email: str
    members: List[TeamMember] = []
    created_at: datetime
    updated_at: Optional[datetime] = None

class TeamInvite(BaseModel):
    team_id: str
    team_name: str
    inviter_email: str
    inviter_name: str
    invitee_email: EmailStr
    role: str = "member"
    status: str = "pending"  # pending, accepted, declined
    created_at: datetime
    expires_at: datetime