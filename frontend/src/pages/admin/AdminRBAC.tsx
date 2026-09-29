import { useEffect, useState, useCallback } from 'react';
import { Card } from '../../components/common/Card';
import { Loader } from '../../components/common/Loader';
import { adminService, type TeamMember } from '../../services/adminService';
import {
  ShieldCheck,
  UserPlus,
  Edit2,
  Trash2,
  Key,
  X,
  RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';

export function AdminRBACPage() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [permissionsCatalog, setPermissionsCatalog] = useState<Record<string, any>>({});
  const [presetRoles, setPresetRoles] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [teamRole, setTeamRole] = useState('Admin Staff');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string>('CUSTOM');
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [members, perms, presets] = await Promise.all([
        adminService.getTeamMembers(),
        adminService.getPermissionsList(),
        adminService.getPresetRoles(),
      ]);
      setTeam(members);
      setPermissionsCatalog(perms);
      setPresetRoles(presets);
    } catch (err) {
      console.error('Failed to load RBAC data:', err);
      toast.error('Failed to load team and RBAC data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openAddModal = () => {
    setEditingMember(null);
    setName('');
    setUsername('');
    setEmail('');
    setPassword('');
    setTeamRole('Operations Manager');
    setSelectedPreset('OPERATIONS_MANAGER');
    setSelectedPermissions(presetRoles['OPERATIONS_MANAGER'] || []);
    setModalOpen(true);
  };

  const openEditModal = (member: TeamMember) => {
    setEditingMember(member);
    setName(member.name);
    setUsername(member.username);
    setEmail(member.email);
    setPassword('');
    setTeamRole(member.team_role || 'Administrator');
    setSelectedPermissions(member.permissions || []);
    setSelectedPreset('CUSTOM');
    setModalOpen(true);
  };

  const handlePresetSelect = (presetKey: string) => {
    setSelectedPreset(presetKey);
    if (presetKey === 'SUPER_ADMIN') {
      setSelectedPermissions(Object.keys(permissionsCatalog));
      setTeamRole('Super Administrator');
    } else if (presetRoles[presetKey]) {
      setSelectedPermissions(presetRoles[presetKey]);
      setTeamRole(presetKey.replace('_', ' '));
    }
  };

  const togglePermission = (permKey: string) => {
    setSelectedPreset('CUSTOM');
    setSelectedPermissions((prev) =>
      prev.includes(permKey) ? prev.filter((p) => p !== permKey) : [...prev, permKey]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingMember) {
        await adminService.updateTeamMember(editingMember.id, {
          name,
          email,
          team_role: teamRole,
          permissions: selectedPermissions,
          password: password.trim() ? password.trim() : undefined,
        });
        toast.success(`Updated permissions for ${editingMember.username}`);
      } else {
        if (!password || password.length < 6) {
          toast.error('Password must be at least 6 characters');
          setSubmitting(false);
          return;
        }
        await adminService.createTeamMember({
          name,
          username,
          email,
          password,
          team_role: teamRole,
          permissions: selectedPermissions,
        });
        toast.success(`Admin member ${username} created successfully`);
      }
      setModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save team member');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (member: TeamMember) => {
    const newStatus = member.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await adminService.updateTeamMember(member.id, { status: newStatus });
      toast.success(`User ${member.username} marked ${newStatus}`);
      fetchData();
    } catch (err: any) {
      toast.error('Failed to change user status');
    }
  };

  const handleDelete = async (member: TeamMember) => {
    if (!window.confirm(`Are you sure you want to disable admin access for ${member.username}?`)) return;
    try {
      await adminService.deleteTeamMember(member.id);
      toast.success(`Admin ${member.username} disabled`);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to disable user');
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <ShieldCheck className="text-cyan-400" size={26} />
            <span>Team Management & RBAC</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Create administrative staff, assign role profiles, and configure module-level permissions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchData()}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#141b2d] hover:bg-[#1a233a] text-gray-300 border border-[#222c44] transition"
          >
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/20 transition cursor-pointer"
          >
            <UserPlus size={16} />
            <span>Add Team Member</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-[#111726] border border-[#1d273d] rounded-2xl p-4">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Staff</span>
          <p className="text-2xl font-black text-white mt-1 font-mono">{team.length}</p>
        </div>
        <div className="bg-[#111726] border border-[#1d273d] rounded-2xl p-4">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Active Admins</span>
          <p className="text-2xl font-black text-emerald-400 mt-1 font-mono">
            {team.filter((m) => m.status === 'ACTIVE').length}
          </p>
        </div>
        <div className="bg-[#111726] border border-[#1d273d] rounded-2xl p-4">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Preset Roles</span>
          <p className="text-2xl font-black text-blue-400 mt-1 font-mono">5 Roles</p>
        </div>
        <div className="bg-[#111726] border border-[#1d273d] rounded-2xl p-4">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Permission Modules</span>
          <p className="text-2xl font-black text-purple-400 mt-1 font-mono">
            {Object.keys(permissionsCatalog).length || 13} Modules
          </p>
        </div>
      </div>

      {/* Team Members Table */}
      <Card title="Administrative Team Members">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="text-gray-400 border-b border-[#1d273d] uppercase text-[10px]">
                <th className="py-3 px-3">Member</th>
                <th className="py-3 px-3">Role / Title</th>
                <th className="py-3 px-3">Permissions</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#182136]">
              {team.map((member) => (
                <tr key={member.id} className="hover:bg-[#141b2d] transition-colors">
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center font-bold text-white text-xs">
                        {member.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <span className="font-bold text-white block">{member.name}</span>
                        <span className="text-[11px] text-gray-400 font-mono">@{member.username}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <span className="font-semibold text-gray-200 block">{member.team_role || 'Admin'}</span>
                    <span className="text-[10px] text-cyan-400 font-mono">{member.role}</span>
                  </td>
                  <td className="py-3 px-3 max-w-md">
                    <div className="flex flex-wrap gap-1">
                      {member.role === 'SUPER_ADMIN' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          ALL PERMISSIONS (SUPER ADMIN)
                        </span>
                      ) : member.permissions && member.permissions.length > 0 ? (
                        member.permissions.map((p) => (
                          <span
                            key={p}
                            className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#1a233a] text-cyan-300 border border-[#263554]"
                          >
                            {p}
                          </span>
                        ))
                      ) : (
                        <span className="text-gray-500 text-[10px]">No specific permissions</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        member.status === 'ACTIVE'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {member.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEditModal(member)}
                        className="p-1.5 rounded-lg text-cyan-400 hover:bg-cyan-500/10 transition"
                        title="Edit Permissions"
                      >
                        <Edit2 size={14} />
                      </button>
                      {member.role !== 'SUPER_ADMIN' && (
                        <>
                          <button
                            onClick={() => handleToggleStatus(member)}
                            className="p-1.5 rounded-lg text-amber-400 hover:bg-amber-500/10 transition"
                            title={member.status === 'ACTIVE' ? 'Suspend User' : 'Activate User'}
                          >
                            <Key size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(member)}
                            className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 transition"
                            title="Disable User"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal: Add / Edit Team Member */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0f1422] border border-[#222c44] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 custom-scrollbar">
            <div className="flex items-center justify-between pb-4 border-b border-[#222c44]">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="text-cyan-400" size={18} />
                  <span>{editingMember ? `Edit Permissions: ${editingMember.name}` : 'Add New Team Member'}</span>
                </h2>
                <p className="text-xs text-gray-400">Configure access rights and permitted dashboard modules.</p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#1c2438] transition"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Rahul Sharma"
                    className="w-full bg-[#141b2d] border border-[#222c44] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Username</label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingMember)}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. rahul_ops"
                    className="w-full bg-[#141b2d] border border-[#222c44] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="rahul@example.com"
                    className="w-full bg-[#141b2d] border border-[#222c44] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    {editingMember ? 'New Password (leave blank to keep)' : 'Password'}
                  </label>
                  <input
                    type="password"
                    required={!editingMember}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full bg-[#141b2d] border border-[#222c44] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* Role Preset Selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Select Role Template (Quick Preset)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {['SUPER_ADMIN', 'OPERATIONS_MANAGER', 'FINANCE_OFFICER', 'SUPPORT_AGENT', 'GAME_MASTER', 'CUSTOM'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handlePresetSelect(preset)}
                      className={`p-2 rounded-xl text-left border text-xs font-semibold transition ${
                        selectedPreset === preset
                          ? 'bg-cyan-600/20 text-cyan-300 border-cyan-500/50'
                          : 'bg-[#141b2d] text-gray-400 border-[#222c44] hover:text-white'
                      }`}
                    >
                      {preset.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">Custom Title / Designation</label>
                <input
                  type="text"
                  value={teamRole}
                  onChange={(e) => setTeamRole(e.target.value)}
                  placeholder="e.g. Operations Manager, Risk Analyst"
                  className="w-full bg-[#141b2d] border border-[#222c44] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Granular Permissions Checkboxes */}
              <div>
                <label className="block text-xs font-bold text-gray-200 mb-2">
                  Granular Module Permissions ({selectedPermissions.length} selected)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1 custom-scrollbar p-1">
                  {Object.entries(permissionsCatalog).map(([key, info]: [string, any]) => {
                    const isChecked = selectedPermissions.includes(key);
                    return (
                      <label
                        key={key}
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition ${
                          isChecked
                            ? 'bg-cyan-950/30 border-cyan-500/40 text-white'
                            : 'bg-[#141b2d] border-[#222c44] text-gray-400 hover:border-gray-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => togglePermission(key)}
                          className="mt-0.5 rounded text-cyan-500 focus:ring-0 cursor-pointer"
                        />
                        <div className="text-xs">
                          <span className="font-bold block leading-tight text-gray-200">{info.label}</span>
                          <span className="text-[10px] text-gray-400 leading-tight block mt-0.5">
                            {info.description}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#222c44]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-gray-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingMember ? 'Save Changes' : 'Create Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
