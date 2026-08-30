import { useEffect, useState } from "react";
import { api, getUser, setToken, setUser } from "../api.js";
import { ROLES, ROLE_LABELS } from "../roles.js";

const empty = { username: "", password: "", full_name: "", role: ROLES.CONTROL_COUNTER, staff_id: "" };
const newRoleEmpty = { slug: "", label: "" };
const MODULE_LABELS = {
  buses: "Buses", staff: "Staff", rotations: "Rotation",
  attendance: "Time Management", accounts: "Accounts", online_accounts: "Online Accounts", maintenance: "Maintenance",
};

export default function Users() {
  const currentUser = getUser();
  const requestedUsername = new URLSearchParams(window.location.search).get("username");
  const [users, setUsers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [rolesInfo, setRolesInfo] = useState({ builtIn: [], custom: [], modules: [] });
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editRole, setEditRole] = useState("");
  const [credentials, setCredentials] = useState({
    username: requestedUsername || currentUser?.username || "",
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [credentialError, setCredentialError] = useState("");
  const [credentialMessage, setCredentialMessage] = useState("");

  const [newRole, setNewRole] = useState(newRoleEmpty);
  const [permsRole, setPermsRole] = useState("");
  const [perms, setPerms] = useState({});
  const [permissionMessage, setPermissionMessage] = useState("");

  function load() {
    api.get("/auth/users").then(setUsers).catch(() => {});
    api.get("/staff").then(setStaff).catch(() => {});
    api.get("/roles").then(setRolesInfo).catch(() => {});
  }
  useEffect(load, []);

  const allRoles = [...rolesInfo.builtIn, ...rolesInfo.custom.map((r) => ({ slug: r.slug, label: r.label }))];
  const roleLabel = (slug) => ROLE_LABELS[slug] || allRoles.find((r) => r.slug === slug)?.label || slug;

  const unlinkedStaff = staff.filter((s) => !users.some((u) => u.staff_id === s.id));

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/auth/users", { ...form, staff_id: form.staff_id || null });
      setForm(empty);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(user) {
    setEditingId(user.id);
    setEditRole(user.role);
  }

  async function saveRole(user) {
    try {
      await api.put(`/auth/users/${user.id}`, { role: editRole });
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(user) {
    if (!confirm(`Remove ${user.full_name}?`)) return;
    try {
      await api.del(`/auth/users/${user.id}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCredentials(e) {
    e.preventDefault();
    setCredentialError("");
    setCredentialMessage("");
    if (credentials.new_password !== credentials.confirm_password) {
      setCredentialError("New passwords do not match");
      return;
    }
    try {
      const result = await api.put("/auth/credentials", {
        username: credentials.username,
        current_password: credentials.current_password,
        new_password: credentials.new_password,
      });
      setToken(result.token);
      setUser(result.user);
      setCredentials((prev) => ({ ...prev, current_password: "", new_password: "", confirm_password: "" }));
      setCredentialMessage("Super Admin credentials updated successfully.");
      load();
    } catch (err) {
      setCredentialError(err.message);
    }
  }

  async function handleCreateRole(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/roles", newRole);
      setNewRole(newRoleEmpty);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteRole(slug) {
    if (!confirm(`Delete the "${roleLabel(slug)}" role?`)) return;
    try {
      await api.del(`/roles/${slug}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function openPermissions(slug) {
    setPermissionMessage("");
    setPermsRole(slug);
    api.get(`/roles/${slug}/permissions`).then(setPerms).catch(() => {});
  }

  function togglePerm(moduleName, field) {
    setPerms((prev) => {
      const current = prev[moduleName] || { can_read: false, can_write: false };
      const enabled = !current[field];
      if (field === "can_write" && enabled) return { ...prev, [moduleName]: { can_read: true, can_write: true } };
      if (field === "can_read" && !enabled) return { ...prev, [moduleName]: { can_read: false, can_write: false } };
      return { ...prev, [moduleName]: { ...current, [field]: enabled } };
    });
  }

  async function savePermissions() {
    setError("");
    try {
      await api.put(`/roles/${permsRole}/permissions`, perms);
      setPermsRole("");
      setPermissionMessage("Permissions saved. Users with this role should sign out and sign in again to refresh their menu.");
      window.setTimeout(() => setPermissionMessage(""), 6000);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Users & Permissions</h1>
          <p>Create staff logins, add new roles, and control what each role can do</p>
        </div>
      </div>
      {permissionMessage && <p className="success-text" style={{ marginBottom: 16 }}>{permissionMessage}</p>}

      {currentUser?.role === ROLES.SUPER_ADMIN && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>Super Admin sign-in</h3>
          <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
            Change your own username or password. Your current password is required for security.
          </p>
          <form className="form-row" onSubmit={handleCredentials}>
            <input placeholder="Username" value={credentials.username} required
              autoComplete="username"
              onChange={(e) => setCredentials({ ...credentials, username: e.target.value })} />
            <input placeholder="Current password" type="password" value={credentials.current_password} required
              autoComplete="current-password"
              onChange={(e) => setCredentials({ ...credentials, current_password: e.target.value })} />
            <input placeholder="New password (8+ characters)" type="password" value={credentials.new_password} required minLength={8}
              autoComplete="new-password"
              onChange={(e) => setCredentials({ ...credentials, new_password: e.target.value })} />
            <input placeholder="Confirm new password" type="password" value={credentials.confirm_password} required minLength={8}
              autoComplete="new-password"
              onChange={(e) => setCredentials({ ...credentials, confirm_password: e.target.value })} />
            <button className="primary" type="submit">Update my credentials</button>
          </form>
          {credentialError && <p className="error-text">{credentialError}</p>}
          {credentialMessage && <p style={{ color: "var(--green)", fontWeight: 700 }}>{credentialMessage}</p>}
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Add a user</h3>
        <form className="form-row" onSubmit={handleCreate}>
          <input placeholder="Username" value={form.username} required
            onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <input placeholder="Password" type="password" value={form.password} required
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <input placeholder="Full name" value={form.full_name} required
            onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, staff_id: "" })}>
            <optgroup label="Built in">
              {rolesInfo.builtIn.map((r) => <option key={r.slug} value={r.slug}>{r.label}</option>)}
            </optgroup>
            {rolesInfo.custom.length > 0 && (
              <optgroup label="Custom">
                {rolesInfo.custom.map((r) => <option key={r.slug} value={r.slug}>{r.label}</option>)}
              </optgroup>
            )}
          </select>
          <select value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })}>
            <option value="">Link to staff member (optional)</option>
            {unlinkedStaff.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.designation})</option>)}
          </select>
          <button className="primary" type="submit">Create user</button>
        </form>
        <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: 8 }}>
          Linking a staff member is optional. Link one only when the account needs staff-based attendance, counter, or bus-duty information.
        </p>
        {error && <p className="error-text">{error}</p>}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <table>
          <thead>
            <tr><th>Name</th><th>Username</th><th>Role</th><th>Linked staff</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.full_name}</td>
                <td>{u.username}</td>
                <td>
                  {u.role === ROLES.SUPER_ADMIN ? (
                    <span className="badge active">{roleLabel(u.role)}</span>
                  ) : editingId === u.id ? (
                    <select value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                      {allRoles.map((r) => <option key={r.slug} value={r.slug}>{r.label}</option>)}
                    </select>
                  ) : (
                    <span className="badge scheduled">{roleLabel(u.role)}</span>
                  )}
                </td>
                <td>{u.staff_name || "—"}</td>
                <td>
                  {u.role === ROLES.SUPER_ADMIN ? (
                    <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>Protected</span>
                  ) : editingId === u.id ? (
                    <>
                      <button className="primary" style={{ marginRight: 8 }} onClick={() => saveRole(u)}>Save</button>
                      <button className="link-danger" onClick={() => setEditingId(null)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button className="link-danger" style={{ marginRight: 12 }} onClick={() => startEdit(u)}>Change role</button>
                      <button className="link-danger" onClick={() => handleDelete(u)}>Remove</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Custom roles</h3>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 0 }}>
          Create a role beyond the built-in ones, then set which modules it can view or edit below. Permissions apply to every user with that role; create a custom role when access should be limited to one person. Live Activity's checkpoint permissions stay fixed.
        </p>
        <form className="form-row" onSubmit={handleCreateRole}>
          <input placeholder="Internal name (e.g. regional_manager)" value={newRole.slug}
            onChange={(e) => setNewRole({ ...newRole, slug: e.target.value })} />
          <input placeholder="Display label (e.g. Regional Manager)" value={newRole.label}
            onChange={(e) => setNewRole({ ...newRole, label: e.target.value })} />
          <button className="primary" type="submit">Create role</button>
        </form>

        <table style={{ marginTop: 12 }}>
          <thead><tr><th>Role</th><th></th></tr></thead>
          <tbody>
            {allRoles.filter((r) => r.slug !== ROLES.SUPER_ADMIN).map((r) => (
              <tr key={r.slug}>
                <td>{r.label}</td>
                <td>
                  <button className="link-danger" style={{ marginRight: 12 }} onClick={() => openPermissions(r.slug)}>Edit permissions</button>
                  {rolesInfo.custom.some((c) => c.slug === r.slug) && (
                    <button className="link-danger" onClick={() => handleDeleteRole(r.slug)}>Delete role</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {permsRole && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Permissions for {roleLabel(permsRole)}</h3>
          {[ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(permsRole) ? (
            <p style={{ color: "var(--muted)" }}>This role always has full access — nothing to configure.</p>
          ) : (
            <>
              <table>
                <thead><tr><th>Module</th><th>View</th><th>Edit</th></tr></thead>
                <tbody>
                  {rolesInfo.modules.map((m) => (
                    <tr key={m}>
                      <td>{MODULE_LABELS[m] || m}</td>
                      <td><input type="checkbox" checked={!!perms[m]?.can_read} onChange={() => togglePerm(m, "can_read")} /></td>
                      <td><input type="checkbox" checked={!!perms[m]?.can_write} onChange={() => togglePerm(m, "can_write")} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(permsRole === ROLES.ACCOUNTS || permsRole === ROLES.MAINTENANCE || permsRole === ROLES.ONLINE_MANAGER) && (
                <p style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                  Note: {roleLabel(permsRole)} already has full access to its own built-in work module — these checkboxes can add other modules on top of that.
                </p>
              )}
              <button className="primary" style={{ marginTop: 10 }} onClick={savePermissions}>Save permissions</button>
              <button className="link-danger" style={{ marginTop: 10, marginLeft: 10 }} onClick={() => setPermsRole("")}>Close</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
