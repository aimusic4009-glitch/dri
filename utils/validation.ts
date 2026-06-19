 export function validateDateFormat(dateStr: string): boolean {
  const regex = /^\d{2}\.\d{2}\.\d{4}$/;
  return regex.test(dateStr);
}

export function parseDate(dateStr: string): Date | null {
  if (!validateDateFormat(dateStr)) {
    return null;
  }

  const [day, month, year] = dateStr.split('.').map(Number);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function isAtLeast18YearsOld(dateStr: string): boolean {
  const date = parseDate(dateStr);
  if (!date) {
    return false;
  }

  const today = new Date();
  const age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();
  const dayDiff = today.getDate() - date.getDate();

  if (age > 18) {
    return true;
  }

  if (age === 18) {
    if (monthDiff > 0) {
      return true;
    }
    if (monthDiff === 0 && dayDiff >= 0) {
      return true;
    }
  }

  return false;
}

export function validateEmail(email: string): boolean {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

export function passwordsMatch(password: string, confirmPassword: string): boolean {
  return password === confirmPassword && password.length > 0;
}

export function isValidPassword(password: string): boolean {
  return password.length >= 6;
}

