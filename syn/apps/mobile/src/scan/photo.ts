import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export interface Photo { base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; uri: string }

const OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], base64: true, quality: 0.7, exif: false, allowsEditing: false };

const MAX_SIDE = 1568;   // larger photos add upload time and model cost without improving the reading

async function toPhoto(r: ImagePicker.ImagePickerResult): Promise<Photo | null> {
  const a = r.canceled ? null : r.assets[0];
  if (!a) return null;
  if (Math.max(a.width, a.height) > MAX_SIDE) {
    const ctx = ImageManipulator.manipulate(a.uri).resize(a.width >= a.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
    const out = await (await ctx.renderAsync()).saveAsync({ base64: true, compress: 0.85, format: SaveFormat.JPEG });
    return out.base64 ? { base64: out.base64, mediaType: 'image/jpeg', uri: out.uri } : null;
  }
  if (!a.base64) return null;
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
