// Manage accounts:  npm run users -- list | add <username> <role> <password> [full name] | remove <username>
import { hashPassword, loadUsers, saveUsers } from './auth.mjs';
import { ROLES } from '../src/auth/roles.js';

const [cmd, username, role, password, ...name] = process.argv.slice(2);
const users = loadUsers();
if (cmd === 'list') {
  users.forEach((u) => console.log(`${u.username.padEnd(16)} ${u.role.padEnd(10)} ${u.name}`));
} else if (cmd === 'add') {
  if (!username || !ROLES[role] || !password || password.length < 10) {
    console.error(`Usage: add <username> <${Object.keys(ROLES).join('|')}> <password, 10+ characters> [full name]`);
    process.exit(1);
  }
  const u = username.toLowerCase();
  const rest = users.filter((x) => x.username !== u);
  saveUsers([...rest, { username: u, name: name.join(' ') || u, role, ...hashPassword(password) }]);
  console.log(`Saved ${u} (${role}).`);
} else if (cmd === 'remove') {
  saveUsers(users.filter((x) => x.username !== String(username).toLowerCase()));
  console.log(`Removed ${username}.`);
} else {
  console.log('Commands: list | add <username> <role> <password> [full name] | remove <username>');
}
