// 2. Fungsi Mencari atau Membuat Folder (Dengan Alarm Error)
export const getOrCreateFolder = async (folderName, parentId = null) => {
  try {
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
  } catch (error) {
    console.error("GAGAL BUAT FOLDER:", error);
    // Munculkan notifikasi pop-up agar kita tahu persis alasannya
    const pesan = error.result?.error?.message || error.message || "Unknown error";
    alert("Gagal membuat folder Drive!\nAlasan Google: " + pesan);
    throw error;
  }
};

// 3. Fungsi Upload File Foto (Jalur Resmi Google API)
export const uploadToDrive = async (base64Data, fileName, folderId) => {
  try {
    // Memecah Base64
    const base64DataOnly = base64Data.split(',')[1];
    const mimeType = base64Data.split(',')[0].split(':')[1].split(';')[0];

    const metadata = {
      name: fileName,
      parents: [folderId]
    };

    // Membungkus file sesuai standar baku Google Drive API
    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: ' + mimeType + '\r\n' +
      'Content-Transfer-Encoding: base64\r\n\r\n' +
      base64DataOnly +
      close_delim;

    // Mengirim menggunakan gapi.client (Sangat Aman & Otomatis pakai Token)
    const request = gapi.client.request({
      'path': '/upload/drive/v3/files',
      'method': 'POST',
      'params': {'uploadType': 'multipart'},
      'headers': {
        'Content-Type': 'multipart/related; boundary="' + boundary + '"'
      },
      'body': multipartRequestBody
    });

    const response = await request;
    return response.result.id;

  } catch (error) {
    console.error("GAGAL UPLOAD FOTO:", error);
    // Munculkan notifikasi pop-up agar kita tahu persis alasannya
    const pesan = error.result?.error?.message || error.message || "Unknown error";
    alert("Gagal mengupload foto ke Drive!\nAlasan Google: " + pesan);
    throw error;
  }
};