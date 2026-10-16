// Clean media storage utility - Supabase Cloud Storage is the authoritative host for all binary media.
export async function saveMediaBlob(
  _id: string,
  _file: Blob | File,
  _mimeType: string,
  _fileName = 'file'
): Promise<string> {
  return '';
}

export async function getMediaBlobUrl(_id: string): Promise<string | null> {
  return null;
}

export async function deleteMediaBlob(_id: string): Promise<boolean> {
  return true;
}

export async function resolveMediaUrl(url: string | undefined): Promise<string> {
  return url || '';
}
