import { gapi } from 'gapi-script';

const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = "https://www.googleapis.com/auth/drive.file";

// 1. Fungsi Inisialisasi (Menyiapkan koneksi ke Google)
export const initDriveService = (apiKey, clientId) => {
  return new Promise((resolve, reject) => {
    gapi.load('client:auth2', () => {
      gapi.client.init({
        apiKey: apiKey,
        clientId: clientId,
        discoveryDocs: DISCOVERY_DOCS,
        scope: SCOPES,
      }).then(() => resolve())
        .catch(err => reject(err));
    });
  });
};

// 2. Fungsi Mencari atau Membuat Folder (Logika Arsiparis)
export const getOrCreateFolder = async (folderName, parentId = null) => {
  let query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentId) query += ` and '${parentId}' in parents`;

  const response = await gapi.client.drive.files.list({
    q: query,
    fields: 'files(id, name)',
  });

  const files = response.result.files;
  if (files && files.length > 0) return files[0].id;

  const fileMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: parentId ? [parentId] : []
  };

  const folder = await gapi.client.drive.files.create({
    resource: fileMetadata,
    fields: 'id',
  });

  return folder.result.id;
};

// 3. Fungsi Upload File Foto
export const uploadToDrive = async (base64Data, fileName, folderId) => {
  // Mengubah Base64 menjadi Blob (format file asli agar bisa dibuka di Drive)
  const byteString = atob(base64Data.split(',')[1]);
  const mimeString = base64Data.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([ab], { type: mimeString });

  const metadata = {
    name: fileName,
    parents: [folderId],
  };

  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  formData.append('file', blob);

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: new Headers({ 'Authorization': 'Bearer ' + gapi.auth.getAuthInstance().currentUser.get().getAuthResponse().access_token }),
    body: formData,
  });

  const result = await response.json();
  return result.id; // Ini ID file yang nanti bisa kita simpan di Firestore
};