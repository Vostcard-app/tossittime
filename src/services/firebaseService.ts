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
import type { FoodItem, FoodItemData, UserSettings, ShoppingListItem, ShoppingList, UserItem, UserItemData } from '../types';

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
      where('userId', '==', userId)
      // Note: Can't orderBy expirationDate since frozen items don't have it
      // Will need to sort in memory instead
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const items = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            expirationDate: data.expirationDate ? data.expirationDate.toDate() : undefined,
            thawDate: data.thawDate ? data.thawDate.toDate() : undefined,
            addedDate: data.addedDate.toDate()
          };
        }) as FoodItem[];
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
      addedDate: Timestamp.now(),
      status,
      reminderSent: false
    };
    
    // For frozen items: save thawDate, for non-frozen: save expirationDate
    if (data.isFrozen && data.thawDate) {
      cleanData.thawDate = Timestamp.fromDate(data.thawDate);
      // Don't include expirationDate for frozen items
    } else if (data.expirationDate) {
      cleanData.expirationDate = Timestamp.fromDate(data.expirationDate);
      // Don't include thawDate for non-frozen items
    }
    
    // Only include optional fields if they have values
    if (data.barcode) cleanData.barcode = data.barcode;
    if (data.quantity) cleanData.quantity = data.quantity;
    if (data.category) cleanData.category = data.category;
    if (data.notes) cleanData.notes = data.notes;
    if (data.photoUrl) cleanData.photoUrl = data.photoUrl;
    if (data.isFrozen !== undefined) cleanData.isFrozen = data.isFrozen;
    if (data.freezeCategory) cleanData.freezeCategory = data.freezeCategory;
    
    const docRef = await addDoc(collection(db, 'foodItems'), cleanData);
    return docRef.id;
  },

  // Update a food item
  async updateFoodItem(itemId: string, updates: Partial<FoodItemData & { status: string; reminderSent?: boolean }>): Promise<void> {
    const docRef = doc(db, 'foodItems', itemId);
    
    // Filter out undefined values (Firestore doesn't allow undefined)
    const updateData: any = {};
    Object.keys(updates).forEach(key => {
      const value = (updates as any)[key];
      if (value !== undefined) {
        updateData[key] = value;
      }
    });
    
    // Convert Date objects to Firestore Timestamps
    if (updateData.expirationDate) {
      updateData.expirationDate = Timestamp.fromDate(updateData.expirationDate);
    }
    if (updateData.thawDate) {
      updateData.thawDate = Timestamp.fromDate(updateData.thawDate);
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
  // Get all shopping list items for a specific list
  async getShoppingListItems(userId: string, listId: string): Promise<ShoppingListItem[]> {
    const q = query(
      collection(db, 'shoppingList'),
      where('userId', '==', userId),
      where('listId', '==', listId),
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
    listId: string,
    callback: (items: ShoppingListItem[]) => void
  ): () => void {
    const q = query(
      collection(db, 'shoppingList'),
      where('userId', '==', userId),
      where('listId', '==', listId),
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
      async addShoppingListItem(userId: string, listId: string, name: string): Promise<string> {
        const cleanData: any = {
          userId,
          listId,
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

// Shopping Lists Service
export const shoppingListsService = {
  // Get all shopping lists for a user
  async getShoppingLists(userId: string): Promise<ShoppingList[]> {
    const q = query(
      collection(db, 'shoppingLists'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt.toDate()
    })) as ShoppingList[];
  },

  // Subscribe to shopping lists changes
  subscribeToShoppingLists(
    userId: string,
    callback: (lists: ShoppingList[]) => void
  ): () => void {
    const q = query(
      collection(db, 'shoppingLists'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const lists = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt.toDate()
        })) as ShoppingList[];
        callback(lists);
      },
      (error: any) => {
        // Check if it's an index error
        if (error?.code === 'failed-precondition' && error?.message?.includes('index')) {
          console.warn('⚠️ Firestore index required for shopping lists query.');
          if (error.message.includes('create_composite')) {
            const indexUrl = error.message.match(/https:\/\/[^\s]+/)?.[0];
            if (indexUrl) {
              console.warn('📋 Create the index here:', indexUrl);
            }
          }
          console.warn('💡 The app will work, but shopping lists won\'t load until the index is created.');
        } else {
          console.error('Error in shopping lists subscription:', error);
        }
        callback([]);
      }
    );
    return unsubscribe;
  },

  // Create a new shopping list
  async createShoppingList(userId: string, name: string, isDefault: boolean = false): Promise<string> {
    const cleanData: any = {
      userId,
      name,
      createdAt: Timestamp.now(),
      isDefault
    };
    try {
      const docRef = await addDoc(collection(db, 'shoppingLists'), cleanData);
      return docRef.id;
    } catch (error) {
      console.error('Error creating shopping list:', error);
      throw error;
    }
  },

  // Update shopping list
  async updateShoppingList(listId: string, data: Partial<ShoppingList>): Promise<void> {
    try {
      const docRef = doc(db, 'shoppingLists', listId);
      const updateData: any = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.isDefault !== undefined) updateData.isDefault = data.isDefault;
      await updateDoc(docRef, updateData);
    } catch (error) {
      console.error('Error updating shopping list:', error);
      throw error;
    }
  },

  // Delete shopping list
  async deleteShoppingList(listId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'shoppingLists', listId));
    } catch (error) {
      console.error('Error deleting shopping list:', error);
      throw error;
    }
  },

  // Get or create default "shop list"
  async getDefaultShoppingList(userId: string): Promise<string> {
    try {
      // Try to find existing default list
      const q = query(
        collection(db, 'shoppingLists'),
        where('userId', '==', userId),
        where('isDefault', '==', true)
      );
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        return querySnapshot.docs[0].id;
      }

      // Try to find list named "shop list"
      const nameQuery = query(
        collection(db, 'shoppingLists'),
        where('userId', '==', userId),
        where('name', '==', 'shop list')
      );
      const nameSnapshot = await getDocs(nameQuery);
      
      if (!nameSnapshot.empty) {
        // Mark it as default
        const listId = nameSnapshot.docs[0].id;
        await this.updateShoppingList(listId, { isDefault: true });
        return listId;
      }

      // Create default "shop list"
      return await this.createShoppingList(userId, 'shop list', true);
    } catch (error) {
      console.error('Error getting default shopping list:', error);
      throw error;
    }
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
  },

  // Set last used shopping list
  async setLastUsedShoppingList(userId: string, listId: string): Promise<void> {
    const settings = await this.getUserSettings(userId);
    if (settings) {
      await this.updateUserSettings({ ...settings, lastUsedShoppingListId: listId });
    } else {
      await this.updateUserSettings({
        userId,
        reminderDays: 7,
        notificationsEnabled: true,
        lastUsedShoppingListId: listId
      });
    }
  }
};

// User Items Service
export const userItemsService = {
  // Get all user items
  async getUserItems(userId: string): Promise<UserItem[]> {
    const q = query(
      collection(db, 'userItems'),
      where('userId', '==', userId),
      orderBy('lastUsed', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt.toDate(),
      lastUsed: doc.data().lastUsed ? doc.data().lastUsed.toDate() : undefined
    })) as UserItem[];
  },

  // Get user item by name
  async getUserItemByName(userId: string, name: string): Promise<UserItem | null> {
    const q = query(
      collection(db, 'userItems'),
      where('userId', '==', userId),
      where('name', '==', name)
    );
    
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return null;
    }
    
    const doc = querySnapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt.toDate(),
      lastUsed: doc.data().lastUsed ? doc.data().lastUsed.toDate() : undefined
    } as UserItem;
  },

  // Create or update user item by name
  async createOrUpdateUserItem(userId: string, data: UserItemData): Promise<string> {
    const existing = await this.getUserItemByName(userId, data.name);
    
    if (existing) {
      // Update existing item
      const docRef = doc(db, 'userItems', existing.id);
      await updateDoc(docRef, {
        expirationLength: data.expirationLength,
        category: data.category || null,
        lastUsed: Timestamp.now()
      });
      return existing.id;
    } else {
      // Create new item
      const cleanData: any = {
        userId,
        name: data.name,
        expirationLength: data.expirationLength,
        createdAt: Timestamp.now(),
        lastUsed: Timestamp.now()
      };
      
      if (data.category) {
        cleanData.category = data.category;
      }
      
      const docRef = await addDoc(collection(db, 'userItems'), cleanData);
      return docRef.id;
    }
  },

  // Update user item by ID
  async updateUserItem(itemId: string, data: Partial<UserItemData>): Promise<void> {
    const docRef = doc(db, 'userItems', itemId);
    const updateData: any = {};
    
    if (data.name !== undefined) updateData.name = data.name;
    if (data.expirationLength !== undefined) updateData.expirationLength = data.expirationLength;
    if (data.category !== undefined) updateData.category = data.category || null;
    
    await updateDoc(docRef, updateData);
  },

  // Update all user items with the same name
  async updateAllUserItemsByName(userId: string, name: string, data: Partial<UserItemData>): Promise<void> {
    const q = query(
      collection(db, 'userItems'),
      where('userId', '==', userId),
      where('name', '==', name)
    );
    
    const querySnapshot = await getDocs(q);
    const updatePromises = querySnapshot.docs.map(doc => {
      const updateData: any = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.expirationLength !== undefined) updateData.expirationLength = data.expirationLength;
      if (data.category !== undefined) updateData.category = data.category || null;
      return updateDoc(doc.ref, updateData);
    });
    
    await Promise.all(updatePromises);
  },

  // Subscribe to user items changes
  subscribeToUserItems(
    userId: string,
    callback: (items: UserItem[]) => void
  ): () => void {
    const q = query(
      collection(db, 'userItems'),
      where('userId', '==', userId),
      orderBy('lastUsed', 'desc')
    );
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot: QuerySnapshot) => {
        const items = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt.toDate(),
          lastUsed: doc.data().lastUsed ? doc.data().lastUsed.toDate() : undefined
        })) as UserItem[];
        callback(items);
      },
      (error) => {
        console.error('Error in user items subscription:', error);
        callback([]);
      }
    );
    
    return unsubscribe;
  }
};

