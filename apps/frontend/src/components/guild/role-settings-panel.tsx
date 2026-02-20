'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Shield, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  GuildResponse,
  RoleResponse,
  PERMISSIONS,
  PermissionUtil,
} from '@discord-platform/shared';
import { useCreateRole, useUpdateRole, useDeleteRole } from '@/hooks/use-role';

const PERMISSION_GROUPS = [
  {
    label: 'General',
    permissions: [
      {
        key: 'VIEW_CHANNELS',
        value: PERMISSIONS.VIEW_CHANNELS,
        label: 'View Channels',
        description: 'Allows members to view channels',
      },
      {
        key: 'MANAGE_GUILD',
        value: PERMISSIONS.MANAGE_GUILD,
        label: 'Manage Server',
        description: 'Allows managing server settings and invites',
      },
      {
        key: 'MANAGE_ROLES',
        value: PERMISSIONS.MANAGE_ROLES,
        label: 'Manage Roles',
        description: 'Allows creating, editing, and deleting roles',
      },
    ],
  },
  {
    label: 'Text',
    permissions: [
      {
        key: 'SEND_MESSAGES',
        value: PERMISSIONS.SEND_MESSAGES,
        label: 'Send Messages',
        description: 'Allows sending messages in text channels',
      },
      {
        key: 'EMBED_LINKS',
        value: PERMISSIONS.EMBED_LINKS,
        label: 'Embed Links',
        description: 'Allows links to show embedded content',
      },
      {
        key: 'ATTACH_FILES',
        value: PERMISSIONS.ATTACH_FILES,
        label: 'Attach Files',
        description: 'Allows uploading files',
      },
      {
        key: 'MENTION_EVERYONE',
        value: PERMISSIONS.MENTION_EVERYONE,
        label: 'Mention @everyone',
        description: 'Allows mentioning @everyone',
      },
    ],
  },
  {
    label: 'Voice',
    permissions: [
      {
        key: 'CONNECT',
        value: PERMISSIONS.CONNECT,
        label: 'Connect',
        description: 'Allows connecting to voice channels',
      },
      {
        key: 'SPEAK',
        value: PERMISSIONS.SPEAK,
        label: 'Speak',
        description: 'Allows speaking in voice channels',
      },
    ],
  },
  {
    label: 'Moderation',
    permissions: [
      {
        key: 'KICK_MEMBERS',
        value: PERMISSIONS.KICK_MEMBERS,
        label: 'Kick Members',
        description: 'Allows kicking members from the server',
      },
      {
        key: 'BAN_MEMBERS',
        value: PERMISSIONS.BAN_MEMBERS,
        label: 'Ban Members',
        description: 'Allows banning members from the server',
      },
      {
        key: 'MUTE_MEMBERS',
        value: PERMISSIONS.MUTE_MEMBERS,
        label: 'Mute Members',
        description: 'Allows muting members in the server',
      },
      {
        key: 'ADMINISTRATOR',
        value: PERMISSIONS.ADMINISTRATOR,
        label: 'Administrator',
        description:
          'Grants all permissions. Members with this have every permission and bypass channel overwrites.',
      },
    ],
  },
];

function PermissionEditor({
  permissions,
  onChange,
  disabled,
}: {
  permissions: number;
  onChange: (perms: number) => void;
  disabled?: boolean;
}) {
  const togglePermission = (value: number) => {
    if (PermissionUtil.has(permissions, value)) {
      onChange(PermissionUtil.remove(permissions, value));
    } else {
      onChange(PermissionUtil.add(permissions, value));
    }
  };

  return (
    <div className="space-y-4">
      {PERMISSION_GROUPS.map((group) => (
        <div key={group.label}>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            {group.label}
          </h4>
          <div className="space-y-1">
            {group.permissions.map((perm) => {
              const isChecked = (permissions & perm.value) === perm.value;
              return (
                <div
                  key={perm.key}
                  className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-gray-700/30"
                >
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="text-sm text-gray-200">{perm.label}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {perm.description}
                    </p>
                  </div>
                  <Switch
                    checked={isChecked}
                    onCheckedChange={() => togglePermission(perm.value)}
                    disabled={disabled}
                    className="data-[state=checked]:bg-indigo-500 data-[state=unchecked]:bg-gray-600 shrink-0"
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Color Palette ───────────────────────────────────────────

const ROLE_COLORS = [
  '#99AAB5',
  '#1ABC9C',
  '#2ECC71',
  '#3498DB',
  '#9B59B6',
  '#E91E63',
  '#F1C40F',
  '#E67E22',
  '#E74C3C',
  '#95A5A6',
  '#607D8B',
  '#11806A',
  '#1F8B4C',
  '#206694',
  '#71368A',
  '#AD1457',
  '#C27C0E',
  '#A84300',
  '#992D22',
  '#979C9F',
];

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ROLE_COLORS.map((color) => (
        <button
          key={color}
          className={`w-7 h-7 rounded-full border-2 transition-all ${
            value === color
              ? 'border-white scale-110'
              : 'border-transparent hover:border-gray-500'
          }`}
          style={{ backgroundColor: color }}
          onClick={() => onChange(color)}
          type="button"
        />
      ))}
    </div>
  );
}

// ─── Inline Role Editor (replaces the nested dialog) ─────────

function RoleEditor({
  guildId,
  role,
  onBack,
}: {
  guildId: string;
  role: RoleResponse;
  onBack: () => void;
}) {
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color);
  const [permissions, setPermissions] = useState(role.permissions);
  const [hoist, setHoist] = useState(role.hoist);
  const [mentionable, setMentionable] = useState(role.mentionable);

  const updateRoleMutation = useUpdateRole();
  const isEveryone = role.name === '@everyone';

  // Reset form when role changes
  useEffect(() => {
    setName(role.name);
    setColor(role.color);
    setPermissions(role.permissions);
    setHoist(role.hoist);
    setMentionable(role.mentionable);
  }, [role]);

  const handleSave = () => {
    updateRoleMutation.mutate(
      {
        guildId,
        roleId: role.id,
        data: {
          ...(isEveryone ? {} : { name: name.trim() }),
          color,
          permissions,
          hoist,
          mentionable,
        },
      },
      {
        onSuccess: () => onBack(),
      },
    );
  };

  const hasChanges =
    name !== role.name ||
    color !== role.color ||
    permissions !== role.permissions ||
    hoist !== role.hoist ||
    mentionable !== role.mentionable;

  return (
    <div className="space-y-4">
      {/* Header with back button */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-8 w-8 text-gray-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: color }}
          />
          <h3 className="text-lg font-semibold text-white">
            Edit — {role.name}
          </h3>
        </div>
      </div>

      {/* Role Name */}
      <div>
        <label className="text-xs font-semibold text-gray-400 uppercase">
          Role Name
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 bg-gray-900 border-gray-600 text-white"
          maxLength={32}
          disabled={isEveryone}
        />
      </div>

      {/* Role Color */}
      <div>
        <label className="text-xs font-semibold text-gray-400 uppercase mb-2 block">
          Role Color
        </label>
        <ColorPicker value={color} onChange={setColor} />
      </div>

      {/* Hoist & Mentionable */}
      <div className="flex items-center justify-between px-1">
        <div>
          <p className="text-sm text-gray-200">Display separately in sidebar</p>
        </div>
        <Switch
          checked={hoist}
          onCheckedChange={setHoist}
          className="data-[state=checked]:bg-indigo-500 data-[state=unchecked]:bg-gray-600"
        />
      </div>

      <div className="flex items-center justify-between px-1">
        <div>
          <p className="text-sm text-gray-200">Allow anyone to @mention</p>
        </div>
        <Switch
          checked={mentionable}
          onCheckedChange={setMentionable}
          className="data-[state=checked]:bg-indigo-500 data-[state=unchecked]:bg-gray-600"
        />
      </div>

      {/* Permissions */}
      <div>
        <label className="text-xs font-semibold text-gray-400 uppercase mb-2 block">
          Permissions
        </label>
        <div className="rounded-lg bg-gray-900/50 p-3">
          <PermissionEditor
            permissions={permissions}
            onChange={setPermissions}
          />
        </div>
      </div>

      {/* Save bar */}
      {hasChanges && (
        <div className="sticky bottom-0 bg-gray-800 border-t border-gray-700 -mx-4 px-4 py-3 flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setName(role.name);
              setColor(role.color);
              setPermissions(role.permissions);
              setHoist(role.hoist);
              setMentionable(role.mentionable);
            }}
            className="text-gray-300 hover:text-white hover:bg-gray-700"
          >
            Reset
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateRoleMutation.isPending}
            className="bg-indigo-500 hover:bg-indigo-600"
          >
            <Save className="h-4 w-4 mr-1" />
            {updateRoleMutation.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Create Role Inline Form ─────────────────────────────────

function CreateRoleForm({
  guildId,
  onBack,
}: {
  guildId: string;
  onBack: () => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#99AAB5');
  const [permissions, setPermissions] = useState(0);
  const [hoist, setHoist] = useState(false);
  const [mentionable, setMentionable] = useState(false);

  const createRoleMutation = useCreateRole();

  const handleCreate = () => {
    if (!name.trim()) return;
    createRoleMutation.mutate(
      {
        guildId,
        data: { name: name.trim(), color, permissions, hoist, mentionable },
      },
      {
        onSuccess: () => onBack(),
      },
    );
  };

  return (
    <div className="space-y-4">
      {/* Header with back button */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-8 w-8 text-gray-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-lg font-semibold text-white">Create Role</h3>
      </div>

      {/* Role Name */}
      <div>
        <label className="text-xs font-semibold text-gray-400 uppercase">
          Role Name
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New Role"
          className="mt-1 bg-gray-900 border-gray-600 text-white"
          maxLength={32}
        />
      </div>

      {/* Role Color */}
      <div>
        <label className="text-xs font-semibold text-gray-400 uppercase mb-2 block">
          Role Color
        </label>
        <ColorPicker value={color} onChange={setColor} />
      </div>

      {/* Hoist & Mentionable */}
      <div className="flex items-center justify-between px-1">
        <div>
          <p className="text-sm text-gray-200">Display separately in sidebar</p>
          <p className="text-xs text-gray-500">Hoist this role</p>
        </div>
        <Switch
          checked={hoist}
          onCheckedChange={setHoist}
          className="data-[state=checked]:bg-indigo-500 data-[state=unchecked]:bg-gray-600"
        />
      </div>

      <div className="flex items-center justify-between px-1">
        <div>
          <p className="text-sm text-gray-200">Allow anyone to @mention</p>
          <p className="text-xs text-gray-500">Members can mention this role</p>
        </div>
        <Switch
          checked={mentionable}
          onCheckedChange={setMentionable}
          className="data-[state=checked]:bg-indigo-500 data-[state=unchecked]:bg-gray-600"
        />
      </div>

      {/* Permissions */}
      <div>
        <label className="text-xs font-semibold text-gray-400 uppercase mb-2 block">
          Permissions
        </label>
        <div className="rounded-lg bg-gray-900/50 p-3">
          <PermissionEditor
            permissions={permissions}
            onChange={setPermissions}
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="sticky bottom-0 bg-gray-800 border-t border-gray-700 -mx-4 px-4 py-3 flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          onClick={onBack}
          className="text-gray-300 hover:text-white hover:bg-gray-700"
        >
          Cancel
        </Button>
        <Button
          onClick={handleCreate}
          disabled={!name.trim() || createRoleMutation.isPending}
          className="bg-indigo-500 hover:bg-indigo-600"
        >
          {createRoleMutation.isPending ? 'Creating...' : 'Create Role'}
        </Button>
      </div>
    </div>
  );
}

// ─── Main Role List Component ────────────────────────────────

type PanelView =
  | { type: 'list' }
  | { type: 'create' }
  | { type: 'edit'; role: RoleResponse };

interface RoleSettingsPanelProps {
  guild: GuildResponse;
}

export default function RoleSettingsPanel({ guild }: RoleSettingsPanelProps) {
  const [view, setView] = useState<PanelView>({ type: 'list' });
  const [deleteTarget, setDeleteTarget] = useState<RoleResponse | null>(null);

  const deleteRoleMutation = useDeleteRole();

  const sortedRoles = [...(guild.roles || [])].sort(
    (a, b) => b.position - a.position,
  );

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteRoleMutation.mutate(
      { guildId: guild.id, roleId: deleteTarget.id },
      {
        onSuccess: () => setDeleteTarget(null),
      },
    );
  };

  // ─── Create / Edit inline views ────────────────────────────
  if (view.type === 'create') {
    return (
      <CreateRoleForm
        guildId={guild.id}
        onBack={() => setView({ type: 'list' })}
      />
    );
  }

  if (view.type === 'edit') {
    return (
      <RoleEditor
        guildId={guild.id}
        role={view.role}
        onBack={() => setView({ type: 'list' })}
      />
    );
  }

  // ─── Role list view ────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Roles</h3>
          <p className="text-sm text-gray-400">
            Manage roles and permissions for this server.
          </p>
        </div>
        <Button
          onClick={() => setView({ type: 'create' })}
          size="sm"
          className="bg-indigo-500 hover:bg-indigo-600"
        >
          <Plus className="h-4 w-4 mr-1" />
          Create Role
        </Button>
      </div>

      {/* Role list */}
      <div className="space-y-1">
        {sortedRoles.map((role) => {
          const isEveryone = role.name === '@everyone';
          return (
            <div
              key={role.id}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 bg-gray-700/30 hover:bg-gray-700/50 transition-colors group cursor-pointer"
              onClick={() => setView({ type: 'edit', role })}
            >
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: role.color }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">
                  {role.name}
                </p>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {role.hoist && <span>Hoisted</span>}
                  {(role.permissions & PERMISSIONS.ADMINISTRATOR) ===
                    PERMISSIONS.ADMINISTRATOR && (
                    <span className="flex items-center gap-0.5 text-yellow-500">
                      <Shield className="h-3 w-3" />
                      Admin
                    </span>
                  )}
                </div>
              </div>
              {!isEveryone && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 hover:bg-red-500/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(role);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}

        {sortedRoles.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-8">
            No roles yet. Create one to get started.
          </p>
        )}
      </div>

      {/* Delete confirmation */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>Delete Role</DialogTitle>
            <DialogDescription className="text-gray-400">
              Are you sure you want to delete the role{' '}
              <span
                className="font-semibold"
                style={{ color: deleteTarget?.color }}
              >
                {deleteTarget?.name}
              </span>
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              className="text-gray-300 hover:text-white hover:bg-gray-700"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteRoleMutation.isPending}
            >
              {deleteRoleMutation.isPending ? 'Deleting...' : 'Delete Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
