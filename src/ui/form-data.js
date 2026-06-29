export function getFormPayload(form) {
  const payload = getFormSnapshot(form);
  form?.reset?.();
  return payload;
}

export function getFormSnapshot(form) {
  return form ? Object.fromEntries(new FormData(form).entries()) : {};
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
