/** Validate user-entered password change details without storing their values. */
export function validatePasswordChange(currentPassword, newPassword, confirmation) {
  if (!currentPassword) return 'Masukkan kata sandi lama.';
  if (newPassword.length < 12 || newPassword.length > 256) return 'Kata sandi baru harus 12–256 karakter.';
  if (newPassword !== confirmation) return 'Konfirmasi kata sandi tidak cocok.';
  return '';
}
