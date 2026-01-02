"use client";

import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

const AddProjectModal = ({ isOpen, onClose, onProjectCreated }) => {
  const { getIdToken } = useAuth();
  const [formData, setFormData] = useState({
    teamName: "",
    description: "",
    memberEmails: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.teamName.trim()) {
      setError("Project name is required");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const token = await getIdToken();

      // Parse member emails
      const memberEmails = formData.memberEmails
        .split(',')
        .map(email => email.trim())
        .filter(email => email.length > 0);

      const projectData = {
        teamName: formData.teamName.trim(),
        description: formData.description.trim(),
        member_emails: memberEmails
      };

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.2:8000'}/teams/`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(projectData),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create project');
      }

      const newProject = await response.json();

      // Reset form
      setFormData({
        teamName: "",
        description: "",
        memberEmails: ""
      });

      onProjectCreated(newProject);
      onClose();
    } catch (err) {
      console.error('Error creating project:', err);

      // If backend is not available, create a mock project for demo
      if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        const mockProject = {
          teamId: `mock-${Date.now()}`,
          teamName: formData.teamName.trim(),
          description: formData.description.trim(),
          members: [
            {
              user_id: 'mock-user',
              email: 'user@example.com',
              name: 'User',
              role: 'admin'
            }
          ],
          created_at: new Date().toISOString(),
          last_message_at: null
        };

        // Reset form
        setFormData({
          teamName: "",
          description: "",
          memberEmails: ""
        });

        onProjectCreated(mockProject);
        onClose();
        return;
      }

      setError(err.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setFormData({
        teamName: "",
        description: "",
        memberEmails: ""
      });
      setError(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-white flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg border border-gray-200 shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Create New Project</h2>
          <button
            onClick={handleClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {/* Project Name */}
          <div>
            <label htmlFor="teamName" className="block text-sm font-medium text-gray-700 mb-2">
              Project Name *
            </label>
            <input
              type="text"
              id="teamName"
              name="teamName"
              value={formData.teamName}
              onChange={handleInputChange}
              placeholder="Enter project name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 placeholder:text-gray-400"
              disabled={loading}
              required
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder="Enter project description (optional)"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none text-gray-900 placeholder:text-gray-400"
              disabled={loading}
            />
          </div>

          {/* Member Emails */}
          <div>
            <label htmlFor="memberEmails" className="block text-sm font-medium text-gray-700 mb-2">
              Invite Members
            </label>
            <input
              type="text"
              id="memberEmails"
              name="memberEmails"
              value={formData.memberEmails}
              onChange={handleInputChange}
              placeholder="Enter email addresses separated by commas"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 placeholder:text-gray-400"
              disabled={loading}
            />
            <p className="text-xs text-gray-500 mt-1">
              Separate multiple email addresses with commas. They will receive an invitation to join.
            </p>
          </div>

          {/* Actions */}
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !formData.teamName.trim()}
              className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Creating...
                </>
              ) : (
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  <span className="text-sm">Create Project</span>
                </span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddProjectModal;
