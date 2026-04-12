import { gapi } from 'gapi-script';

const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = "https://www.googleapis.com/auth/drive.file";

// 1. Fungsi Inisialisasi (VERSI TEGAS)
export const initDriveService = (apiKey, clientId) => {
  return new Promise((resolve, reject) => {
    gapi.load('client:auth2', () => {
      gapi.client.init({
        apiKey: apiKey,
        clientId: clientId,
        discoveryDocs: DISCOVERY_DOCS,
        scope: SCOPES,
      }).then(() => {
        const authInstance = gapi.auth2.getAuthInstance();
        
        // PENTING: Cek apakah user sudah login dan apakah sudah kasih izin Drive
        if (!authInstance.isSignedIn.get()) {
           // Jika belum login, minta login DAN izin sekaligus
           authInstance.signIn({ 
             prompt: 'consent', // <-- Ini 'Sakti' supaya muncul halaman centang izin
             ux_mode: 'popup'
           }).then(() => resolve()).catch(err => reject(err));
        } else {
           // Jika sudah login tapi folder gagal terus, kita paksa minta izin ulang
           const user = authInstance.currentUser.get();
           if (!user.hasGrantedScopes(SCOPES)) {
             user.grant({ scope: SCOPES, prompt: 'consent' })
               .then(() => resolve()).catch(err => reject(err));
           } else {
             resolve();
           }
        }
      })
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
  // Mengubah Base64 menjadi Blob (format file asli)
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

  // 👇 PERBAIKAN: Cara ambil Token yang jauh lebih aman dan anti-error
  const accessToken = gapi.client.getToken().access_token;

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
    body: formData,
  });

  const result = await response.json();
  
  // Menangkap error dari Google jika ada, biar ketahuan masalahnya
  if (result.error) {
    console.error("Error dari Drive:", result.error);
    throw new Error(result.error.message);
  }
  
  return result.id; 
};