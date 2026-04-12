export const getOrCreateFolder = async (folderName, parentId = null) => {
  const token = localStorage.getItem('googleDriveToken');
  if (!token) throw new Error("Sesi habis. Silakan Logout dan Login kembali.");

  let query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentId) query += ` and '${parentId}' in parents`;

  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error("Sesi Google kedaluwarsa (Batas 1 Jam). Silakan LOGOUT lalu LOGIN kembali.");
    const errData = await response.json();
    throw new Error(`Google menolak: ${errData.error?.message || "Unknown error"}`);
  }
  
  const data = await response.json();
  if (data.files && data.files.length > 0) return data.files[0].id;

  const resCreate = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: parentId ? [parentId] : [] })
  });
  
  if (!resCreate.ok) {
    if (resCreate.status === 401) throw new Error("Sesi Google kedaluwarsa. Silakan LOGOUT lalu LOGIN kembali.");
    const errData = await resCreate.json();
    throw new Error(`Google menolak: ${errData.error?.message || "Gagal buat folder"}`);
  }
  return (await resCreate.json()).id;
};

export const uploadToDrive = async (base64Data, fileName, folderId) => {
  const token = localStorage.getItem('googleDriveToken');
  if (!token) throw new Error("Sesi habis. Silakan Logout dan Login kembali.");

  const byteString = atob(base64Data.split(',')[1]);
  const mimeString = base64Data.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) { ia[i] = byteString.charCodeAt(i); }
  const blob = new Blob([ab], { type: mimeString });

  const metadata = { name: fileName, parents: [folderId] };
  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  formData.append('file', blob);

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData,
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error("Sesi Google kedaluwarsa (Batas 1 Jam). Silakan LOGOUT lalu LOGIN kembali.");
    const errData = await response.json();
    throw new Error(`Google menolak: ${errData.error?.message || "Gagal upload"}`);
  }
  return (await response.json()).id;
};