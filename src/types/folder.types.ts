export interface FileMetadata {
  uri: string;
  name: string | null;
  size: number | null;
  type: 'file' | 'directory';
  mimeType: string | null;
  modificationTime: number | null;
  isDirectory: boolean;
}

export interface FolderInfo {
  uri: string;
  name: string;
  bookmark?: string; // For iOS, opaque on Android
}

export interface FolderAccessState {
  folder: FolderInfo | null;
  files: FileMetadata[];
  loading: boolean;
  error: string | null;
  permissionStatus: 'granted' | 'denied' | 'unknown';
}
