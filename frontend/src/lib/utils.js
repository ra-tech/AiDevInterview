export function cn(...inputs) {
  return inputs.filter(Boolean).join(' ');
}

export function labelize(enumValue) {
  if (!enumValue) return '';
  return enumValue
    .toLowerCase()
    .split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}
