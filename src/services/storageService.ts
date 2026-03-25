import AsyncStorage from '@react-native-async-storage/async-storage';
import { FolderInfo } from '../types/folder.types';

const FOLDER_URI_KEY = '@folder_access:selected_folder';

export const storageService = {
  async saveFolder(folder: FolderInfo): Promise<void> {
    try {
      await AsyncStorage.setItem(FOLDER_URI_KEY, JSON.stringify(folder));
    } catch (error) {
      console.error('Failed to save folder:', error);
      throw new Error('Could not persist folder selection');
    }
  },

  async getFolder(): Promise<FolderInfo | null> {
    try {
      const data = await AsyncStorage.getItem(FOLDER_URI_KEY);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to retrieve folder:', error);
      return null;
    }
  },

  async clearFolder(): Promise<void> {
    try {
      await AsyncStorage.removeItem(FOLDER_URI_KEY);
    } catch (error) {
      console.error('Failed to clear folder:', error);
    }
  },
};
