import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Image, Platform, ScrollView, ActivityIndicator, KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ImagePlus, X, Send, Camera, FileText, Calendar } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showAlert } from '@/utils/alertHelper';
import { authedFetch } from '@/utils/authedFetch';

const API_BASE = process.env.EXPO_PUBLIC_STRIPE_SERVER_URL || '';
const LOCAL_POSTS_KEY = '@plyz_local_posts';

async function compressImage(uri: string): Promise<string> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch {
    return uri;
  }
}

async function moderateImageOnServer(uri: string): Promise<{ safe: boolean; error?: string }> {
  try {
    const formData = new FormData();
    if (Platform.OS === 'web') {
      const response = await fetch(uri);
      const blob = await response.blob();
      formData.append('image', blob, 'photo.jpg');
    } else {
      formData.append('image', {
        uri,
        type: 'image/jpeg',
        name: 'photo.jpg',
      } as any);
    }

    const res = await fetch(`${API_BASE}/api/moderate-image`, {
      method: 'POST',
      body: formData,
    });

    if (res.status === 403) {
      return { safe: false, error: 'content_rejected' };
    }
    if (!res.ok) {
      return { safe: true };
    }
    const data = await res.json();
    return { safe: data.safe !== false };
  } catch (err) {
    console.warn('[Moderation] Check failed, allowing:', err);
    return { safe: true };
  }
}

async function uploadImageToServer(uri: string): Promise<{ url: string | null; rejected?: boolean }> {
  try {
    const formData = new FormData();

    if (Platform.OS === 'web') {
      const response = await fetch(uri);
      const blob = await response.blob();
      formData.append('image', blob, 'photo.jpg');
    } else {
      formData.append('image', {
        uri,
        type: 'image/jpeg',
        name: 'photo.jpg',
      } as any);
    }

    const res = await fetch(`${API_BASE}/api/upload-post-image`, {
      method: 'POST',
      body: formData,
    });

    if (res.status === 403) {
      return { url: null, rejected: true };
    }
    if (!res.ok) throw new Error('Upload failed');
    const data = await res.json();
    return { url: data.url || null };
  } catch (err) {
    console.warn('[Upload] Failed:', err);
    return { url: null };
  }
}

type PostKind = 'post' | 'event';

export default function CreatePostScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    prefillTitle?: string;
    prefillBody?: string;
    prefillKind?: string;
    prefillDate?: string;
  }>();
  const [kind, setKind] = useState<PostKind>((params.prefillKind as PostKind) || 'post');
  const [title, setTitle] = useState(params.prefillTitle || '');
  const [body, setBody] = useState(params.prefillBody || '');
  const [eventDate, setEventDate] = useState(params.prefillDate || '');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [moderating, setModerating] = useState(false);

  const pickImage = async (fromCamera = false) => {
    try {
      let result;
      if (fromCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') return;
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          quality: 0.8,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') return;
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          quality: 0.8,
        });
      }
      if (!result.canceled && result.assets[0]) {
        const compressed = await compressImage(result.assets[0].uri);

        setModerating(true);
        const modResult = await moderateImageOnServer(compressed);
        setModerating(false);

        if (!modResult.safe) {
          showAlert(
            t('contentRejected' as any) || 'Content Rejected',
            t('contentRejectedMessage' as any) || 'This image contains inappropriate content and cannot be published. Please choose a different photo.'
          );
          return;
        }

        setImageUri(compressed);
      }
    } catch (err) {
      setModerating(false);
      console.error('Image pick error:', err);
    }
  };

  const handlePublish = async () => {
    if (!body.trim() && !imageUri) return;
    setPublishing(true);

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      let mediaUrl: string | null = null;

      if (imageUri) {
        const uploadResult = await uploadImageToServer(imageUri);
        if (uploadResult.rejected) {
          showAlert(
            t('contentRejected' as any) || 'Content Rejected',
            t('contentRejectedMessage' as any) || 'This image contains inappropriate content and cannot be published. Please choose a different photo.'
          );
          setPublishing(false);
          return;
        }
        mediaUrl = uploadResult.url;
        if (!mediaUrl) {
          mediaUrl = imageUri;
        }
      }

      const eventDateValue = kind === 'event' && eventDate.trim() ? eventDate.trim() : null;
      const newPost = {
        id: `local-${Date.now()}`,
        kind,
        title: title.trim() || null,
        body: body.trim() || null,
        media_url: mediaUrl,
        event_date: eventDateValue,
        created_at: new Date().toISOString(),
        celebrity: {
          user_id: user?.id || 'local-celebrity',
          stage_name: 'You',
          avatar_url: null,
          official_verified: false,
          stripe_verified: false,
        },
      };

      try {
        const res = await authedFetch(`${API_BASE}/api/posts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            celebrity_id: user?.id || 'local-celebrity',
            kind,
            title: newPost.title,
            body: newPost.body,
            media_url: mediaUrl,
            event_date: eventDateValue,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.post) {
            newPost.id = data.post.id;
          }
        }
      } catch {}

      const stored = await AsyncStorage.getItem(LOCAL_POSTS_KEY);
      const localPosts = stored ? JSON.parse(stored) : [];
      localPosts.unshift(newPost);
      await AsyncStorage.setItem(LOCAL_POSTS_KEY, JSON.stringify(localPosts));

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      router.back();
    } catch (err) {
      console.error('Publish error:', err);
      showAlert(
        t('error' as any) || 'Error',
        t('publishError' as any) || 'Failed to publish. Please try again.'
      );
    } finally {
      setPublishing(false);
    }
  };

  const canPublish = (body.trim().length > 0 || imageUri !== null) && !publishing;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0a1628', '#0f2035', '#0a1628']} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('newPost' as any)}</Text>
        <TouchableOpacity
          style={[styles.publishBtn, !canPublish && styles.publishBtnDisabled]}
          onPress={handlePublish}
          disabled={!canPublish}
          activeOpacity={0.7}
        >
          {publishing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Send size={16} color={canPublish ? '#fff' : '#6b7280'} />
              <Text style={[styles.publishBtnText, !canPublish && styles.publishBtnTextDisabled]}>
                {t('publish' as any)}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.kindRow}>
        <TouchableOpacity
          style={[styles.kindBtn, kind === 'post' && styles.kindBtnActive]}
          onPress={() => setKind('post')}
          activeOpacity={0.8}
        >
          <FileText size={16} color={kind === 'post' ? '#fff' : '#6b7280'} />
          <Text style={[styles.kindText, kind === 'post' && styles.kindTextActive]}>
            {t('createPostTypePost' as any) || 'Post'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.kindBtn, kind === 'event' && styles.kindBtnActiveEvent]}
          onPress={() => setKind('event')}
          activeOpacity={0.8}
        >
          <Calendar size={16} color={kind === 'event' ? '#000' : '#6b7280'} />
          <Text style={[styles.kindText, kind === 'event' && styles.kindTextActiveEvent]}>
            {t('createPostTypeEvent' as any) || 'Événement'}
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.content}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          keyboardShouldPersistTaps="handled"
        >
          <TextInput
            style={styles.titleInput}
            placeholder={t('postTitlePlaceholder' as any)}
            placeholderTextColor="#6b7280"
            value={title}
            onChangeText={setTitle}
            maxLength={100}
          />

          <TextInput
            style={styles.bodyInput}
            placeholder={t('postBodyPlaceholder' as any)}
            placeholderTextColor="#6b7280"
            value={body}
            onChangeText={setBody}
            multiline
            textAlignVertical="top"
            maxLength={2000}
          />

          {moderating ? (
            <View style={styles.moderatingWrap}>
              <ActivityIndicator size="large" color="#f59e0b" />
              <Text style={styles.moderatingText}>
                {t('moderatingImage' as any) || 'Checking image content...'}
              </Text>
            </View>
          ) : imageUri ? (
            <View style={styles.imagePreviewWrap}>
              <Image source={{ uri: imageUri }} style={styles.imagePreview} />
              <TouchableOpacity
                style={styles.removeImageBtn}
                onPress={() => setImageUri(null)}
                activeOpacity={0.7}
              >
                <X size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.mediaRow}>
            <TouchableOpacity
              style={[styles.mediaBtn, moderating && { opacity: 0.4 }]}
              onPress={() => pickImage(false)}
              activeOpacity={0.7}
              disabled={moderating}
            >
              <ImagePlus size={22} color="#10b981" />
              <Text style={styles.mediaBtnText}>{t('addPhoto' as any)}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.mediaBtn, moderating && { opacity: 0.4 }]}
              onPress={() => pickImage(true)}
              activeOpacity={0.7}
              disabled={moderating}
            >
              <Camera size={22} color="#3b82f6" />
              <Text style={styles.mediaBtnText}>{t('camera' as any)}</Text>
            </TouchableOpacity>
          </View>

          {kind === 'event' && (
            <View style={styles.eventDateSection}>
              <Text style={styles.eventDateLabel}>
                {t('createPostEventDate' as any) || 'Date de l\'événement'}
              </Text>
              <TextInput
                style={styles.eventDateInput}
                value={eventDate}
                onChangeText={setEventDate}
                placeholder="2026-03-15T18:00"
                placeholderTextColor="#4b5563"
              />
              <Text style={styles.eventDateHint}>
                {t('createPostEventDateHint' as any) || 'Format : AAAA-MM-JJTHH:MM'}
              </Text>
            </View>
          )}

          <Text style={styles.hint}>{t('postImageHint' as any)}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a1628' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10b981',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  publishBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  publishBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  publishBtnTextDisabled: {
    color: '#6b7280',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  titleInput: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    marginBottom: 16,
  },
  bodyInput: {
    color: '#d1d5db',
    fontSize: 16,
    lineHeight: 24,
    minHeight: 120,
    paddingVertical: 8,
  },
  moderatingWrap: {
    marginTop: 16,
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  moderatingText: {
    color: '#f59e0b',
    fontSize: 14,
    marginTop: 12,
    fontWeight: '500',
  },
  imagePreviewWrap: {
    marginTop: 16,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  imagePreview: {
    width: '100%',
    height: 250,
    borderRadius: 16,
  },
  removeImageBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  mediaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  mediaBtnText: {
    color: '#d1d5db',
    fontSize: 14,
    fontWeight: '500',
  },
  hint: {
    color: '#6b7280',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
  kindRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  kindBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  kindBtnActive: {
    backgroundColor: '#10b981',
  },
  kindBtnActiveEvent: {
    backgroundColor: '#f59e0b',
  },
  kindText: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '600',
  },
  kindTextActive: {
    color: '#fff',
  },
  kindTextActiveEvent: {
    color: '#000',
  },
  eventDateSection: {
    marginTop: 20,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.2)',
  },
  eventDateLabel: {
    color: '#f59e0b',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  eventDateInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  eventDateHint: {
    color: '#6b7280',
    fontSize: 11,
    marginTop: 6,
  },
});
