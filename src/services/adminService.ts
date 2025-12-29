import { doc, getDocs, collection, query, where, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

// Configure admin emails here
const ADMIN_EMAILS = [
  'info@vostcard.com',
  // Add more admin emails as needed
];

export const adminService = {
  // Check if current user is admin
  async isAdmin(userId?: string, email?: string | null): Promise<boolean> {
    if (!userId && !email) return false;
    
    // Check email-based admin list
    if (email && ADMIN_EMAILS.includes(email.toLowerCase())) {
      return true;
    }
    
    // Could also check Firestore admin document if needed
    // For now, using email-based approach for simplicity
    return false;
  },

  // Get all users (admin only)
  async getAllUsers(): Promise<any[]> {
    // Note: Firebase Auth doesn't provide a direct way to list all users
    // We'll need to collect user data from Firestore collections
    // This gets users from foodItems collection
    const foodItemsSnapshot = await getDocs(collection(db, 'foodItems'));
    const userIds = new Set<string>();
    
    foodItemsSnapshot.forEach(doc => {
      const userId = doc.data().userId;
      if (userId) userIds.add(userId);
    });
    
    // Also check userSettings
    const settingsSnapshot = await getDocs(collection(db, 'userSettings'));
    settingsSnapshot.forEach(doc => {
      userIds.add(doc.id);
    });
    
    // Get user info from auth (limited - we can only get current user)
    // For full user list, you'd need a Cloud Function or Admin SDK
    const users = Array.from(userIds).map(uid => ({
      uid,
      // We can't get email from client-side, would need backend
    }));
    
    return users;
  },

  // Get user statistics
  async getUserStats(userId: string): Promise<{
    foodItemsCount: number;
    userItemsCount: number;
  }> {
    const [foodItems, userItems] = await Promise.all([
      getDocs(query(collection(db, 'foodItems'), where('userId', '==', userId))),
      getDocs(query(collection(db, 'userItems'), where('userId', '==', userId))),
    ]);
    
    return {
      foodItemsCount: foodItems.size,
      userItemsCount: userItems.size,
    };
  },

  // Get system-wide statistics
  async getSystemStats(): Promise<{
    totalUsers: number;
    totalFoodItems: number;
    totalShoppingLists: number;
    totalUserItems: number;
  }> {
    const [foodItems, shoppingLists, userItems, userSettings] = await Promise.all([
      getDocs(collection(db, 'foodItems')),
      getDocs(collection(db, 'shoppingLists')),
      getDocs(collection(db, 'userItems')),
      getDocs(collection(db, 'userSettings')),
    ]);
    
    // Count unique users
    const userIds = new Set<string>();
    foodItems.forEach(doc => userIds.add(doc.data().userId));
    shoppingLists.forEach(doc => userIds.add(doc.data().userId));
    userItems.forEach(doc => userIds.add(doc.data().userId));
    userSettings.forEach(doc => userIds.add(doc.id));
    
    return {
      totalUsers: userIds.size,
      totalFoodItems: foodItems.size,
      totalShoppingLists: shoppingLists.size,
      totalUserItems: userItems.size,
    };
  },

  // Delete user data (admin only)
  async deleteUserData(userId: string): Promise<void> {
    // Delete all user's food items
    const foodItemsSnapshot = await getDocs(
      query(collection(db, 'foodItems'), where('userId', '==', userId))
    );
    const foodItemDeletes = foodItemsSnapshot.docs.map(doc => deleteDoc(doc.ref));
    
    // Delete all user's shopping lists
    const shoppingListsSnapshot = await getDocs(
      query(collection(db, 'shoppingLists'), where('userId', '==', userId))
    );
    const shoppingListDeletes = shoppingListsSnapshot.docs.map(doc => deleteDoc(doc.ref));
    
    // Delete shopping list items
    const shoppingListItemsSnapshot = await getDocs(
      query(collection(db, 'shoppingList'), where('userId', '==', userId))
    );
    const shoppingListItemDeletes = shoppingListItemsSnapshot.docs.map(doc => deleteDoc(doc.ref));
    
    // Delete user items
    const userItemsSnapshot = await getDocs(
      query(collection(db, 'userItems'), where('userId', '==', userId))
    );
    const userItemDeletes = userItemsSnapshot.docs.map(doc => deleteDoc(doc.ref));
    
    // Delete user categories
    const userCategoriesSnapshot = await getDocs(
      query(collection(db, 'userCategories'), where('userId', '==', userId))
    );
    const userCategoryDeletes = userCategoriesSnapshot.docs.map(doc => deleteDoc(doc.ref));
    
    // Delete user settings
    const userSettingsRef = doc(db, 'userSettings', userId);
    await deleteDoc(userSettingsRef);
    
    // Execute all deletes
    await Promise.all([
      ...foodItemDeletes,
      ...shoppingListDeletes,
      ...shoppingListItemDeletes,
      ...userItemDeletes,
      ...userCategoryDeletes,
    ]);
  },
};

