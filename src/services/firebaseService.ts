import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  onSnapshot,
  QuerySnapshot
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/firebaseConfig';
import type { FoodItem, FoodItemData, UserSettings, ShoppingListItem } from '../types';

// Food Items Service
export const foodItemService = {
  // Get all food items for a user
  async getFoodItems(userId: string): Promise<FoodItem[]> {
    const q = query(
      collection(db, 'foodItems'),
      where('userId', '==', userId),
      orderBy('expirationDate', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      expirationDate: doc.data().expirationDate.toDate(),
      addedDate: doc.data().addedDate.toDate()
    })) as FoodItem[];
  },

  // Subscribe to food items changes
  subscribeToFoodItems(
    userId: string,
    callback: (items: FoodItem[]) => void
  ): () => void {
    const q = query(
      collection(db, 'foodItems'),
      where('userId', '==', userId),
      orderBy('expirationDate', 'asc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const items = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          expirationDate: doc.data().expirationDate.toDate(),
          addedDate: doc.data().addedDate.toDate()
        })) as FoodItem[];
        callback(items);
      },
      (error) => {
        // Handle Firestore errors gracefully
        console.error('❌ Firestore query error:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Full error object:', JSON.stringify(error, null, 2));
        
        // If index is missing or still building
        if (error.code === 'failed-precondition') {
          // Only log once to reduce console noise
          if (!(window as any).__firestoreIndexWarningShown) {
            console.warn('⚠️ Firestore index required for food items query.');
            console.warn('📋 Create the index here:', error.message.match(/https:\/\/[^\s]+/)?.[0] || 'Firebase Console → Firestore → Indexes');
            console.warn('💡 The app will work, but food items won\'t load until the index is created and enabled.');
            console.warn('💡 If you just created the index, wait 2-5 minutes for it to build, then refresh.');
            (window as any).__firestoreIndexWarningShown = true;
          }
          callback([]); // Return empty array so app doesn't break
        } else {
          // For other errors, log them normally
          console.error('Error in food items subscription:', error);
          callback([]); // Still return empty array to prevent app crash
        }
      }
    );

    return unsubscribe;
  },

  // Add a new food item
  async addFoodItem(userId: string, data: FoodItemData, status: 'fresh' | 'expiring_soon' | 'expired'): Promise<string> {
    // Remove undefined fields (Firestore doesn't allow undefined)
    const cleanData: any = {
      userId,
      name: data.name,
      expirationDate: Timestamp.fromDate(data.expirationDate),
      addedDate: Timestamp.now(),
      status,
      reminderSent: false
    };
    
    // Only include optional fields if they have values
    if (data.barcode) cleanData.barcode = data.barcode;
    if (data.quantity) cleanData.quantity = data.quantity;
    if (data.category) cleanData.category = data.category;
    if (data.notes) cleanData.notes = data.notes;
    if (data.photoUrl) cleanData.photoUrl = data.photoUrl;
    
    const docRef = await addDoc(collection(db, 'foodItems'), cleanData);
    return docRef.id;
  },

  // Update a food item
  async updateFoodItem(itemId: string, updates: Partial<FoodItemData & { status: string; reminderSent?: boolean }>): Promise<void> {
    const docRef = doc(db, 'foodItems', itemId);
    const updateData: any = { ...updates };
    
    if (updates.expirationDate) {
      updateData.expirationDate = Timestamp.fromDate(updates.expirationDate);
    }
    
    await updateDoc(docRef, updateData);
  },

  // Delete a food item
  async deleteFoodItem(itemId: string): Promise<void> {
    await deleteDoc(doc(db, 'foodItems', itemId));
  },

  // Upload photo
  async uploadPhoto(userId: string, file: File): Promise<string> {
    const storageRef = ref(storage, `foodItems/${userId}/${Date.now()}_${file.name}`);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  }
};

// Shopping List Service
export const shoppingListService = {
  // Get all shopping list items for a user
  async getShoppingListItems(userId: string): Promise<ShoppingListItem[]> {
    const q = query(
      collection(db, 'shoppingList'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt.toDate()
    })) as ShoppingListItem[];
  },

  // Subscribe to shopping list changes
  subscribeToShoppingList(
    userId: string,
    callback: (items: ShoppingListItem[]) => void
  ): () => void {
    const q = query(
      collection(db, 'shoppingList'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const items = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt.toDate()
        })) as ShoppingListItem[];
        callback(items);
      },
      (error) => {
        if (error.code === 'failed-precondition') {
          if (!(window as any).__shoppingListIndexWarningShown) {
            const indexUrl = error.message.match(/https:\/\/[^\s]+/)?.[0];
            console.warn('⚠️ Firestore index required for shopping list query.');
            if (indexUrl) {
              console.warn('📋 Create the index here:', indexUrl);
            } else {
              console.warn('📋 Go to Firebase Console → Firestore → Indexes to create the index.');
            }
            console.warn('💡 Shopping list items won\'t load until the index is created and enabled.');
            (window as any).__shoppingListIndexWarningShown = true;
          }
          callback([]); // Return empty array so app doesn't break
        } else {
          console.error('Error in shopping list subscription:', error);
          callback([]);
        }
      }
    );

    return unsubscribe;
  },

  // Add item to shopping list
  async addShoppingListItem(userId: string, name: string): Promise<string> {
    const cleanData: any = {
      userId,
      name,
      createdAt: Timestamp.now()
    };
    
    const docRef = await addDoc(collection(db, 'shoppingList'), cleanData);
    return docRef.id;
  },

  // Delete item from shopping list
  async deleteShoppingListItem(itemId: string): Promise<void> {
    await deleteDoc(doc(db, 'shoppingList', itemId));
  }
};

// User Settings Service
export const userSettingsService = {
  // Get user settings
  async getUserSettings(userId: string): Promise<UserSettings | null> {
    const docRef = doc(db, 'userSettings', userId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return docSnap.data() as UserSettings;
    }
    return null;
  },

  // Create or update user settings
  async updateUserSettings(settings: UserSettings): Promise<void> {
    const docRef = doc(db, 'userSettings', settings.userId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      await updateDoc(docRef, settings as any);
    } else {
      await addDoc(collection(db, 'userSettings'), settings);
    }
  }
};

