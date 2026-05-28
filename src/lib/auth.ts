import type { AppUser } from '../types';

type StoredUser = AppUser & {
  passwordHash: string;
};

const USERS_KEY = 'thinkbattle.users';
const SESSION_KEY = 'thinkbattle.currentUserId';

const readUsers = (): StoredUser[] => {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) ?? '[]') as StoredUser[];
  } catch {
    return [];
  }
};

const writeUsers = (users: StoredUser[]) => {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

const toPublicUser = (user: StoredUser): AppUser => ({
  id: user.id,
  email: user.email,
  nickname: user.nickname,
  provider: user.provider,
  createdAt: user.createdAt,
});

const hashPassword = (password: string) => btoa(encodeURIComponent(password));

const createUserId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `user_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

export const getCurrentUser = (): AppUser | null => {
  const currentUserId = localStorage.getItem(SESSION_KEY);
  if (!currentUserId) return null;

  const user = readUsers().find(item => item.id === currentUserId);
  return user ? toPublicUser(user) : null;
};

export const signUpWithEmail = (email: string, password: string, nickname: string): AppUser => {
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedNickname = nickname.trim();

  if (!normalizedEmail || !password || !trimmedNickname) {
    throw new Error('이메일, 비밀번호, 닉네임을 모두 입력해 주세요.');
  }

  const users = readUsers();
  if (users.some(user => user.email === normalizedEmail)) {
    throw new Error('이미 가입된 이메일입니다.');
  }

  const user: StoredUser = {
    id: createUserId(),
    email: normalizedEmail,
    nickname: trimmedNickname,
    provider: 'email',
    createdAt: new Date().toISOString(),
    passwordHash: hashPassword(password),
  };

  writeUsers([...users, user]);
  localStorage.setItem(SESSION_KEY, user.id);
  return toPublicUser(user);
};

export const signInWithEmail = (email: string, password: string): AppUser => {
  const normalizedEmail = email.trim().toLowerCase();
  const user = readUsers().find(item => item.email === normalizedEmail);

  if (!user || user.passwordHash !== hashPassword(password)) {
    throw new Error('이메일 또는 비밀번호가 올바르지 않습니다.');
  }

  localStorage.setItem(SESSION_KEY, user.id);
  return toPublicUser(user);
};

export const signOut = () => {
  localStorage.removeItem(SESSION_KEY);
};
