export const getCsrfToken = () => {
  if (typeof document === 'undefined') {
    return null;
  }
  const cookieEntry = document.cookie
    .split(';')
    .map((chunk) => chunk.trim())
    .find((chunk) => chunk.startsWith('csrfToken='));

  if (!cookieEntry) {
    return null;
  }

  return decodeURIComponent(cookieEntry.split('=')[1]);
};

export const requireCsrfToken = () => {
  const token = getCsrfToken();
  if (!token) {
    throw new Error('csrfToken ausente. Usuário pode precisar autenticar novamente.');
  }
  return token;
};
