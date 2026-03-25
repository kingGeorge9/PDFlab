import AsyncStorage from "@react-native-async-storage/async-storage";
import { FileInfo, getAllFiles } from "./fileService";

const FOLDERS_KEY = "@docu_assistant_folders";
const FILE_FOLDER_MAP_KEY = "@docu_assistant_file_folder_map";

// In-memory caches to avoid repeated AsyncStorage reads
let foldersCache: Folder[] | null = null;
let fileFolderMapCache: FileFolderMap | null = null;

export interface Folder {
  id: string;
  name: string;
  parentId: string | null; // null means root level
  color: string;
  icon: string;
  dateCreated: number;
  dateModified: number;
  fileCount?: number;
}

export interface FileFolderMap {
  [fileId: string]: string; // fileId -> folderId
}

// Predefined folder colors
export const FOLDER_COLORS = [
  "#FF4D4D", // Coral Red
  "#7B3F00", // Chocolate
  "#FFD600", // Sunny Yellow
  "#00CC00", // Pure Green
  "#00FFFF", // Cyan
  "#4169E1", // Royal Blue
  "#E0007A", // Magenta
  "#E97451", // Burnt Sienna
  "#008080", // Cobalt Teal
  "#FF9500", // Golden Amber
];

// Predefined folder icons (Ionicons names)
export const FOLDER_ICONS = [
  "folder",
  "folder-open",
  "briefcase",
  "business",
  "document-text",
  "receipt",
  "school",
  "home",
  "medical",
  "camera",
  "musical-notes",
  "images",
  "code",
  "book",
  "newspaper",
];

// Get all folders
export const getAllFolders = async (): Promise<Folder[]> => {
  if (foldersCache) return foldersCache;
  try {
    const foldersJson = await AsyncStorage.getItem(FOLDERS_KEY);
    foldersCache = foldersJson ? JSON.parse(foldersJson) : [];
    return foldersCache!;
  } catch (error) {
    console.error("Error getting folders:", error);
    return [];
  }
};

const saveFolders = async (folders: Folder[]): Promise<void> => {
  foldersCache = folders;
  await AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
};

const saveFileFolderMap = async (map: FileFolderMap): Promise<void> => {
  fileFolderMapCache = map;
  await AsyncStorage.setItem(FILE_FOLDER_MAP_KEY, JSON.stringify(map));
};

// Get folder by ID
export const getFolderById = async (
  folderId: string,
): Promise<Folder | null> => {
  const folders = await getAllFolders();
  return folders.find((f) => f.id === folderId) || null;
};

// Get root folders (no parent)
export const getRootFolders = async (): Promise<Folder[]> => {
  const folders = await getAllFolders();
  return folders.filter((f) => f.parentId === null);
};

// Get subfolders of a folder
export const getSubfolders = async (parentId: string): Promise<Folder[]> => {
  const folders = await getAllFolders();
  return folders.filter((f) => f.parentId === parentId);
};

// Create a new folder
export const createFolder = async (
  name: string,
  parentId: string | null = null,
  color: string = FOLDER_COLORS[0],
  icon: string = FOLDER_ICONS[0],
): Promise<Folder> => {
  try {
    const folders = await getAllFolders();

    const newFolder: Folder = {
      id: `folder_${Date.now()}_${Math.random()}`,
      name,
      parentId,
      color,
      icon,
      dateCreated: Date.now(),
      dateModified: Date.now(),
      fileCount: 0,
    };

    await saveFolders([...folders, newFolder]);

    return newFolder;
  } catch (error) {
    console.error("Error creating folder:", error);
    throw error;
  }
};

// Update folder
export const updateFolder = async (
  folderId: string,
  updates: Partial<Folder>,
): Promise<void> => {
  try {
    const folders = await getAllFolders();
    const folderIndex = folders.findIndex((f) => f.id === folderId);

    if (folderIndex === -1) {
      throw new Error("Folder not found");
    }

    const updatedFolders = folders.map((f, i) =>
      i === folderIndex ? { ...f, ...updates, dateModified: Date.now() } : f,
    );

    await saveFolders(updatedFolders);
  } catch (error) {
    console.error("Error updating folder:", error);
    throw error;
  }
};

// Delete folder (and move files to parent or root)
export const deleteFolder = async (folderId: string): Promise<void> => {
  try {
    const folders = await getAllFolders();
    const folder = folders.find((f) => f.id === folderId);

    if (!folder) {
      throw new Error("Folder not found");
    }

    // Move all files in this folder to its parent or root
    const fileFolderMap = await getFileFolderMap();
    const newMap: FileFolderMap = {};

    for (const [fileId, folderIdInMap] of Object.entries(fileFolderMap)) {
      if (folderIdInMap === folderId) {
        // Move to parent or remove from map (means root)
        if (folder.parentId) {
          newMap[fileId] = folder.parentId;
        }
        // If no parent, don't add to map (file goes to root)
      } else {
        newMap[fileId] = folderIdInMap;
      }
    }

    await saveFileFolderMap(newMap);

    // Delete all subfolders recursively
    const subfolders = await getSubfolders(folderId);
    for (const subfolder of subfolders) {
      await deleteFolder(subfolder.id);
    }

    // Delete the folder itself
    const updatedFolders = folders.filter((f) => f.id !== folderId);
    await saveFolders(updatedFolders);
  } catch (error) {
    console.error("Error deleting folder:", error);
    throw error;
  }
};

// Get file-folder mapping
export const getFileFolderMap = async (): Promise<FileFolderMap> => {
  if (fileFolderMapCache) return fileFolderMapCache;
  try {
    const mapJson = await AsyncStorage.getItem(FILE_FOLDER_MAP_KEY);
    fileFolderMapCache = mapJson ? JSON.parse(mapJson) : {};
    return fileFolderMapCache!;
  } catch (error) {
    console.error("Error getting file-folder map:", error);
    return {};
  }
};

// Get folder for a file
export const getFileFolderId = async (
  fileId: string,
): Promise<string | null> => {
  const map = await getFileFolderMap();
  return map[fileId] || null;
};

// Move file to folder
export const moveFileToFolder = async (
  fileId: string,
  folderId: string | null,
): Promise<void> => {
  try {
    const map = await getFileFolderMap();

    if (folderId === null) {
      // Move to root - remove from map
      delete map[fileId];
    } else {
      // Verify folder exists
      const folder = await getFolderById(folderId);
      if (!folder) {
        throw new Error("Folder not found");
      }
      map[fileId] = folderId;
    }

    await saveFileFolderMap(map);

    // Update file counts
    await updateFolderFileCounts();
  } catch (error) {
    console.error("Error moving file to folder:", error);
    throw error;
  }
};

// Move multiple files to folder
export const moveFilesToFolder = async (
  fileIds: string[],
  folderId: string | null,
): Promise<void> => {
  try {
    const map = await getFileFolderMap();

    for (const fileId of fileIds) {
      if (folderId === null) {
        delete map[fileId];
      } else {
        map[fileId] = folderId;
      }
    }

    await saveFileFolderMap(map);
    await updateFolderFileCounts();
  } catch (error) {
    console.error("Error moving files to folder:", error);
    throw error;
  }
};

// Get files in a folder
export const getFilesInFolder = async (
  folderId: string | null,
  allFiles: FileInfo[],
): Promise<FileInfo[]> => {
  const map = await getFileFolderMap();

  if (folderId === null) {
    // Root level - files not in any folder
    return allFiles.filter((file) => !map[file.id]);
  }

  // Files in specific folder
  return allFiles.filter((file) => map[file.id] === folderId);
};

// Update file counts for all folders
export const updateFolderFileCounts = async (): Promise<void> => {
  try {
    const folders = await getAllFolders();
    const map = await getFileFolderMap();

    // Count files in each folder
    const counts: { [folderId: string]: number } = {};
    for (const folderId of Object.values(map)) {
      counts[folderId] = (counts[folderId] || 0) + 1;
    }

    // Update folder file counts
    const updatedFolders = folders.map((folder) => ({
      ...folder,
      fileCount: counts[folder.id] || 0,
    }));

    await saveFolders(updatedFolders);
  } catch (error) {
    console.error("Error updating folder file counts:", error);
  }
};

// Get folder path (breadcrumb)
export const getFolderPath = async (
  folderId: string | null,
): Promise<Folder[]> => {
  if (folderId === null) return [];

  const folders = await getAllFolders();
  const path: Folder[] = [];
  let currentId: string | null = folderId;

  while (currentId) {
    const folder = folders.find((f) => f.id === currentId);
    if (!folder) break;
    path.unshift(folder);
    currentId = folder.parentId;
  }

  return path;
};

// Check if folder name exists at same level
export const folderNameExists = async (
  name: string,
  parentId: string | null,
  excludeId?: string,
): Promise<boolean> => {
  const folders = await getAllFolders();
  return folders.some(
    (f) =>
      f.name.toLowerCase() === name.toLowerCase() &&
      f.parentId === parentId &&
      f.id !== excludeId,
  );
};

// Get folder statistics
export const getFolderStats = async (
  folderId: string,
): Promise<{
  fileCount: number;
  subfolderCount: number;
  totalSize: number;
}> => {
  const subfolders = await getSubfolders(folderId);
  const map = await getFileFolderMap();

  const fileIds = Object.entries(map)
    .filter(([_, folderIdInMap]) => folderIdInMap === folderId)
    .map(([fileId]) => fileId);

  // Calculate total size from file records
  let totalSize = 0;
  try {
    const allFiles = await getAllFiles();
    for (const fileId of fileIds) {
      const file = allFiles.find((f) => f.id === fileId);
      if (file && file.size) {
        totalSize += file.size;
      }
    }
  } catch (e) {
    console.warn("Could not calculate folder size:", e);
  }

  return {
    fileCount: fileIds.length,
    subfolderCount: subfolders.length,
    totalSize,
  };
};

// Clear the entire file-folder map (used by Library Clear All)
export const clearFileFolderMap = async (): Promise<void> => {
  fileFolderMapCache = {};
  await AsyncStorage.setItem(FILE_FOLDER_MAP_KEY, JSON.stringify({}));
  // Reset file counts on all folders to zero
  const folders = await getAllFolders();
  const resetFolders = folders.map((f) => ({ ...f, fileCount: 0 }));
  await saveFolders(resetFolders);
};

// Remove multiple files from ALL folder mappings in one pass
export const removeFilesFromAllFolders = async (fileIds: string[]): Promise<void> => {
  if (fileIds.length === 0) return;
  try {
    const map = await getFileFolderMap();
    let changed = false;
    for (const fileId of fileIds) {
      if (fileId in map) {
        delete map[fileId];
        changed = true;
      }
    }
    if (!changed) return;
    fileFolderMapCache = map;
    await AsyncStorage.setItem(FILE_FOLDER_MAP_KEY, JSON.stringify(map));
    await updateFolderFileCounts();
  } catch (error) {
    console.error("Error removing files from folders:", error);
  }
};

// Remove a single file from ALL folder mappings (does not affect library)
export const removeFileFromAllFolders = async (fileId: string): Promise<void> => {
  try {
    const map = await getFileFolderMap();
    if (!(fileId in map)) return;
    delete map[fileId];
    fileFolderMapCache = map;
    await AsyncStorage.setItem(FILE_FOLDER_MAP_KEY, JSON.stringify(map));
    await updateFolderFileCounts();
  } catch (error) {
    console.error("Error removing file from folders:", error);
  }
};

// Search folders
export const searchFolders = async (query: string): Promise<Folder[]> => {
  const folders = await getAllFolders();
  const lowerQuery = query.toLowerCase();
  return folders.filter((f) => f.name.toLowerCase().includes(lowerQuery));
};

// Move folder to another folder
export const moveFolder = async (
  folderId: string,
  newParentId: string | null,
): Promise<void> => {
  try {
    const folders = await getAllFolders();
    const folder = folders.find((f) => f.id === folderId);

    if (!folder) {
      throw new Error("Folder not found");
    }

    // Prevent moving folder into itself or its descendants
    if (newParentId) {
      let checkId: string | null = newParentId;
      while (checkId) {
        if (checkId === folderId) {
          throw new Error("Cannot move folder into itself or its descendants");
        }
        const parent = folders.find((f) => f.id === checkId);
        checkId = parent?.parentId || null;
      }
    }

    await updateFolder(folderId, { parentId: newParentId });
  } catch (error) {
    console.error("Error moving folder:", error);
    throw error;
  }
};

// Export/backup folder structure
export const exportFolderStructure = async (): Promise<string> => {
  const folders = await getAllFolders();
  const map = await getFileFolderMap();
  return JSON.stringify({ folders, fileMap: map }, null, 2);
};

// Import/restore folder structure
export const importFolderStructure = async (
  jsonData: string,
): Promise<void> => {
  try {
    const data = JSON.parse(jsonData);
    await saveFolders(data.folders);
    await saveFileFolderMap(data.fileMap);
  } catch (error) {
    console.error("Error importing folder structure:", error);
    throw error;
  }
};

// Remove specific file IDs from the file-folder map
export const removeFilesFromFolderMap = async (
  fileIds: string[],
): Promise<void> => {
  const map = await getFileFolderMap();
  const idSet = new Set(fileIds);
  const newMap: FileFolderMap = {};
  for (const [fid, folderId] of Object.entries(map)) {
    if (!idSet.has(fid)) newMap[fid] = folderId;
  }
  fileFolderMapCache = newMap;
  await AsyncStorage.setItem(FILE_FOLDER_MAP_KEY, JSON.stringify(newMap));
};
