"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import ThemedLoader from "./ThemedLoader";
import InviteNotifications from "./InviteNotifications";
import AddMemberModal from "./AddMemberModal";
import { useToast } from "./ToastContainer";
import {
  Instrument_Serif,
  Domine,
  Electrolize,
  Rajdhani,
} from "next/font/google";

const domine = Domine({
  subsets: ["latin"],
  weight: "600",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const electrolize = Electrolize({
  subsets: ["latin"],
  weight: "400",
});

const rajdhani = Rajdhani({
  subsets: ["latin"],
  weight: "500",
});

const ProjectSidebar = ({
  selectedProject,
  onProjectSelect,
  onCreateProject,
  refreshTrigger,
  onThinkBuddyClick,
  onProjectsLoaded,
}) => {
  const { getIdToken, user } = useAuth();
  const { showSuccess, showError, showConfirm } = useToast();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [offlineMode, setOfflineMode] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState(null);

  useEffect(() => {
    fetchProjects();
  }, [refreshTrigger]);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      setOfflineMode(false);

      const token = await getIdToken();

      if (!token) {
        throw new Error("No authentication token available");
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.2:8000"}/teams/`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("API Error:", response.status, errorText);

        // Handle specific error cases
        if (response.status === 401) {
          throw new Error("Authentication failed. Please login again.");
        } else if (response.status === 500) {
          throw new Error("Server error. Please try again later.");
        } else if (response.status === 404) {
          // No teams found, return empty array
          setProjects([]);
          return;
        } else {
          throw new Error(`Failed to fetch projects: ${response.status}`);
        }
      }

      const data = await response.json();
      const projectsData = Array.isArray(data) ? data : [];
      setProjects(projectsData);
      if (onProjectsLoaded) {
        onProjectsLoaded(projectsData);
      }
    } catch (err) {
      console.error("Error fetching projects:", err);
      setError(err.message || "Failed to load projects");

      // Enable offline mode with mock data
      setOfflineMode(true);
      const mockProjects = getMockProjects();
      setProjects(mockProjects);
      if (onProjectsLoaded) {
        onProjectsLoaded(mockProjects);
      }
    } finally {
      setLoading(false);
    }
  };

  // Mock data for offline mode
  const getMockProjects = () => {
    return [
      {
        teamId: "mock-1",
        teamName: "Sample Project",
        description: "This is a sample project for demonstration",
        members: [
          {
            user_id: user?.uid || "mock-user",
            email: user?.email || "user@example.com",
            name: user?.displayName || "User",
            role: "admin",
          },
        ],
        created_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
      },
      {
        teamId: "mock-2",
        teamName: "Development Team",
        description: "Working on the new features",
        members: [
          {
            user_id: user?.uid || "mock-user",
            email: user?.email || "user@example.com",
            name: user?.displayName || "User",
            role: "admin",
          },
          {
            user_id: "mock-dev-1",
            email: "dev1@example.com",
            name: "Developer 1",
            role: "member",
          },
        ],
        created_at: new Date(Date.now() - 86400000).toISOString(),
        last_message_at: new Date(Date.now() - 3600000).toISOString(),
      },
    ];
  };

  const handleProjectClick = (project) => {
    onProjectSelect(project);
  };

  const handleDeleteProject = async (e, projectId) => {
    e.stopPropagation();
    showConfirm("Are you sure you want to delete this project?", async () => {
      try {
        const token = await getIdToken();
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.2:8000"}/teams/${projectId}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) throw new Error("Failed to delete project");

        showSuccess("Project deleted successfully");
        if (selectedProject?.teamId === projectId) {
          onProjectSelect(null);
        }
        fetchProjects();
      } catch (err) {
        console.error("Error deleting project:", err);
        showError("Failed to delete project");
      }
    });
  };

  const openAddMemberModal = (e, teamId) => {
    e.stopPropagation();
    setSelectedTeamId(teamId);
    setShowAddMemberModal(true);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="w-96 bg-white border-r border-gray-200 h-full flex items-center justify-center">
        <ThemedLoader size="md" text="Loading projects..." />
      </div>
    );
  }

  return (
    <div className="w-96 bg-white border-gray-200 h-full flex flex-col shadow-sm">
      {/* Header */}
      <div className="p-4 border border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 font-sans">Projects</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNotifications(true)}
              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors relative"
              title="Notifications"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {/* Optional: Add a red dot if there are pending invites */}
            </button>
            <button
              onClick={onCreateProject}
              className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 text-xs rounded-sm font-medium transition-all flex items-center gap-1.5"
            >
              Add +
            </button>
          </div>
        </div>

        {/* ThinkBuddy Button */}
        <button
          onClick={onThinkBuddyClick}
          className="group relative w-full bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 text-white px-4 py-3.5 rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-2 mb-4 overflow-hidden hover:scale-101 active:scale-95 hover:-translate-y-0.5"
        >
          {/* Animated background gradient */}
          <div className="absolute inset-0 bg-gradient-to-r from-purple-700 via-blue-700 to-indigo-700 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

          {/* Shine effect */}
          <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>

          <svg
            className="w-5 h-5 relative z-10 group-hover:rotate-12 group-hover:scale-110 transition-transform duration-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
          <span className="relative z-10 group-hover:tracking-wide transition-all duration-300">
            <span className="group-hover:hidden">ThinkBuddy Assistant</span>
            <span className="hidden group-hover:inline">ThinkBuddy Assistant</span>
          </span>
        </button>

        {/* Offline Mode Indicator */}
        {offlineMode && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-2">
              <svg
                className="w-4 h-4 text-yellow-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
              <p className="text-yellow-700 text-sm">
                Demo mode - Backend not connected
              </p>
            </div>
            <button
              onClick={fetchProjects}
              className="text-yellow-600 hover:text-yellow-700 text-xs font-medium mt-2"
            >
              Try connecting again
            </button>
          </div>
        )}

        {/* Error Message */}
        {error && !offlineMode && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <p className="text-red-600 text-sm">{error}</p>
            <button
              onClick={fetchProjects}
              className="text-blue-600 hover:text-blue-700 text-xs font-medium mt-2"
            >
              Try again
            </button>
          </div>
        )}
      </div>

      {/* Projects List */}
      <div className="flex-1 overflow-y-auto">
        {projects.length === 0 ? (
          <div className="p-4 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg
                className="w-8 h-8 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
            <p className="text-gray-500 text-sm mb-2">No projects yet</p>
            <p className="text-gray-400 text-xs">
              Create your first project to get started
            </p>
          </div>
        ) : (
          <div className="p-2">
            {projects.map((project) => (
              <div
                key={project.teamId}
                onClick={() => handleProjectClick(project)}
                className={`p-2.5  cursor-pointer transition-all mb-2 group relative ${selectedProject?.teamId === project.teamId
                  ? "bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-300 shadow-sm"
                  : "hover:bg-white hover:shadow-sm border border-gray-100"
                  }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <h3 className="font-semibold text-gray-900 truncate text-sm flex-1">
                        {project.teamName}
                      </h3>
                      {project.admin_id === user?.uid && (
                        <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => openAddMemberModal(e, project.teamId)}
                            className="p-1 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50"
                            title="Add Member"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => handleDeleteProject(e, project.teamId)}
                            className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                            title="Delete Project"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex -space-x-1">
                        {project.members?.slice(0, 2).map((member, index) => (
                          <div
                            key={index}
                            className="w-5 h-5 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center border-2 border-white shadow-sm"
                          >
                            <span className="text-white text-xs font-medium">
                              {member.name?.charAt(0).toUpperCase() ||
                                member.email?.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        ))}
                        {project.members?.length > 2 && (
                          <div className="w-5 h-5 bg-gray-200 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                            <span className="text-gray-600 text-xs font-medium">
                              +{project.members.length - 2}
                            </span>
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">
                        {project.members?.length} member
                        {project.members?.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                  {project.last_message_at && (
                    <div className="ml-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 bg-white">
        <div className="text-xs text-gray-500 text-center font-medium">
          {projects.length} project{projects.length !== 1 ? "s" : ""}
        </div>
      </div>
      <InviteNotifications
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
        onInviteHandled={fetchProjects}
      />

      <AddMemberModal
        isOpen={showAddMemberModal}
        onClose={() => setShowAddMemberModal(false)}
        teamId={selectedTeamId}
      />
    </div>
  );
};

export default ProjectSidebar;
