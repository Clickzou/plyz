import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Story {
  id: string;
  uri: string;
  timestamp: number;
  template: string;
  customText: string;
  sourceMemoryId?: string;
}

const STORIES_STORAGE_KEY = 'stories';
const MAX_STORIES = 20;

export async function getStories(): Promise<Story[]> {
  try {
    const data = await AsyncStorage.getItem(STORIES_STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading stories:', error);
    return [];
  }
}

export async function saveStory(story: Omit<Story, 'id' | 'timestamp'>): Promise<Story> {
  try {
    const stories = await getStories();
    
    const newStory: Story = {
      ...story,
      id: `story_${Date.now()}`,
      timestamp: Date.now(),
    };
    
    const updatedStories = [newStory, ...stories].slice(0, MAX_STORIES);
    
    await AsyncStorage.setItem(STORIES_STORAGE_KEY, JSON.stringify(updatedStories));
    
    return newStory;
  } catch (error) {
    console.error('Error saving story:', error);
    throw error;
  }
}

export async function deleteStory(storyId: string): Promise<void> {
  try {
    const stories = await getStories();
    const updatedStories = stories.filter(s => s.id !== storyId);
    await AsyncStorage.setItem(STORIES_STORAGE_KEY, JSON.stringify(updatedStories));
  } catch (error) {
    console.error('Error deleting story:', error);
    throw error;
  }
}

export async function clearAllStories(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORIES_STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing stories:', error);
    throw error;
  }
}
