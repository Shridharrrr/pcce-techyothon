"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "./ToastContainer";

const InviteNotifications = ({ isOpen, onClose, onInviteHandled }) => {
    const { getIdToken } = useAuth();
    const { showSuccess, showError } = useToast();
    const [invites, setInvites] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isOpen) {
            fetchInvites();
        }
    }, [isOpen]);

    const fetchInvites = async () => {
        try {
            setLoading(true);
            const token = await getIdToken();
            if (!token) return;

            const response = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.2:8000"}/teams/invites/my`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            if (response.ok) {
                const data = await response.json();
                setInvites(data);
            }
        } catch (err) {
            console.error("Error fetching invites:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleInvite = async (inviteId, action) => {
        try {
            const token = await getIdToken();
            const response = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.2:8000"}/teams/invites/${inviteId}/${action}`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            if (!response.ok) throw new Error(`Failed to ${action} invite`);

            showSuccess(`Invite ${action}ed successfully`);
            fetchInvites(); // Refresh list

            if (action === "accept" && onInviteHandled) {
                onInviteHandled(); // Trigger project refresh
            }
        } catch (err) {
            console.error(`Error ${action}ing invite:`, err);
            showError(`Failed to ${action} invite`);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="font-semibold text-gray-900">Notifications</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="overflow-y-auto p-4 flex-1">
                    {loading ? (
                        <div className="text-center py-4 text-gray-500">Loading...</div>
                    ) : invites.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <p>No new notifications</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {invites.map((invite) => (
                                <div key={invite.invite_id || invite.id} className="border border-gray-100 rounded-lg p-4 bg-gray-50">
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold shrink-0">
                                            {invite.inviter_name?.[0]?.toUpperCase() || "U"}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm text-gray-900">
                                                <span className="font-semibold">{invite.inviter_name || invite.inviter_email}</span> invited you to join{" "}
                                                <span className="font-semibold">{invite.team_name}</span>
                                            </p>
                                            <p className="text-xs text-gray-500 mt-1">
                                                {new Date(invite.created_at).toLocaleDateString()}
                                            </p>
                                            <div className="flex gap-2 mt-3">
                                                <button
                                                    onClick={() => handleInvite(invite.invite_id || invite.id, "accept")}
                                                    className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors"
                                                >
                                                    Accept
                                                </button>
                                                <button
                                                    onClick={() => handleInvite(invite.invite_id || invite.id, "reject")}
                                                    className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-xs font-medium rounded hover:bg-gray-50 transition-colors"
                                                >
                                                    Decline
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default InviteNotifications;
