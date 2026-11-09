import * as ImagePicker from 'expo-image-picker';

export interface Photo { base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; uri: string }

const OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], base64: true, quality: 0.7, exif: false, allowsEditing: false };

function toPhoto(r: ImagePicker.ImagePickerResult): Photo | null {
  const a = r.canceled ? null : r.assets[0];
  if (!a?.base64) return null;
  const mediaType = a.mimeType === 'image/png' ? 'image/png' : a.mimeType === 'image/webp' ? 'image/webp' : 'image/jpeg';
  return { base64: a.base64, mediaType, uri: a.uri };
}

export async function takeLabelPhoto(): Promise<Photo | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  return toPhoto(await ImagePicker.launchCameraAsync(OPTIONS));
}
export async function pickLabelPhoto(): Promise<Photo | null> {
  return toPhoto(await ImagePicker.launchImageLibraryAsync(OPTIONS));
}
