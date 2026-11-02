/** Shared passive values accepted by HTML paste and record-local rich descriptions. */
export const safeUrl = url => typeof url === 'string' && /^(https?:\/\/|mailto:)/i.test(url.trim()) && !/[\u0000-\u001f]/.test(url);
export const safeColor = value => typeof value === 'string' && /^(#[\da-f]{3,8}|[a-z]{1,24}|rgba?\([\d.,%\s]+\)|hsla?\([\d.,%\s]+\))$/i.test(value) && !['inherit', 'initial', 'unset', 'revert'].includes(value);
