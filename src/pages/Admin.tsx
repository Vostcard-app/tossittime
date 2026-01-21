import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase/firebaseConfig';
import { adminService } from '../services/adminService';
import { recipeSiteService } from '../services/recipeSiteService';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import HamburgerMenu from '../components/layout/HamburgerMenu';
import Banner from '../components/layout/Banner';
import { analyticsAggregationService } from '../services/analyticsAggregationService';
import type { DashboardOverview, RetentionMetrics, FunnelMetrics, EngagementMetrics } from '../types/analytics';
import type { RecipeSite, RecipeSiteData } from '../types/recipeImport';
import { getErrorInfo } from '../types';
import { showToast } from '../components/Toast';
import {
  getAllMasterFoodItems,
  createMasterFoodItem,
  updateMasterFoodItem,
  deleteMasterFoodItem,
  getMasterFoodListCategories,
  importFromJSON,
  type MasterFoodListItem
} from '../services/masterFoodListService';
import type { FoodKeeperItem } from '../types';
import foodkeeperData from '../data/foodkeeper.json';
import { clearFoodKeeperCache } from '../services/foodkeeperService';

interface UserInfo {
  uid: string;
  email?: string;
  username?: string;
  foodItemsCount: number;
  userItemsCount: number;
}

const Admin: React.FC = () => {
  const [user] = useAuthState(auth);
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [systemStats, setSystemStats] = useState({
    totalUsers: 0,
    totalFoodItems: 0,
    totalShoppingLists: 0,
    totalUserItems: 0,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [analyticsOverview, setAnalyticsOverview] = useState<DashboardOverview | null>(null);
  const [retentionMetrics, setRetentionMetrics] = useState<RetentionMetrics | null>(null);
  const [funnelMetrics, setFunnelMetrics] = useState<FunnelMetrics | null>(null);
  const [engagementMetrics, setEngagementMetrics] = useState<EngagementMetrics | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState({
    overview: true,
    acquisition: false,
    activation: false,
    retention: false,
    engagement: false,
    funnel: false,
    quality: false,
  });
  
  // Recipe sites state
  const [recipeSites, setRecipeSites] = useState<RecipeSite[]>([]);
  const [loadingRecipeSites, setLoadingRecipeSites] = useState(false);
  const [showRecipeSiteForm, setShowRecipeSiteForm] = useState(false);
  const [editingRecipeSite, setEditingRecipeSite] = useState<RecipeSite | null>(null);
  const [recipeSiteForm, setRecipeSiteForm] = useState<RecipeSiteData>({
    label: '',
    baseUrl: '',
    searchTemplateUrl: '',
    enabled: true
  });
  const [savingRecipeSite, setSavingRecipeSite] = useState(false);

  // Master Food List state
  const [masterFoodItems, setMasterFoodItems] = useState<MasterFoodListItem[]>([]);
  const [loadingMasterFoodList, setLoadingMasterFoodList] = useState(false);
  const [masterFoodListError, setMasterFoodListError] = useState<string | null>(null);
  const [showMasterFoodListForm, setShowMasterFoodListForm] = useState(false);
  const [editingMasterFoodItem, setEditingMasterFoodItem] = useState<MasterFoodListItem | null>(null);
  const [masterFoodListForm, setMasterFoodListForm] = useState<FoodKeeperItem>({
    name: '',
    category: '',
    refrigeratorDays: null,
    freezerDays: null,
    pantryDays: null
  });
  const [savingMasterFoodItem, setSavingMasterFoodItem] = useState(false);
  const [masterFoodListSearch, setMasterFoodListSearch] = useState('');
  const [masterFoodListCategoryFilter, setMasterFoodListCategoryFilter] = useState<string>('');
  const [masterFoodListCategories, setMasterFoodListCategories] = useState<string[]>([]);
  const [importingFromJSON, setImportingFromJSON] = useState(false);
  const [populatingEmails, setPopulatingEmails] = useState(false);

  // Check admin status
  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) {
        navigate('/login');
        return;
      }

      const adminStatus = await adminService.isAdmin(user.uid, user.email || null);
      setIsAdmin(adminStatus);
      setLoading(false);

      if (!adminStatus) {
        navigate('/shop');
      }
    };

    checkAdmin();
  }, [user, navigate]);

  // Load recipe sites
  const loadRecipeSites = async () => {
    if (!isAdmin) return;
    setLoadingRecipeSites(true);
    try {
      const sites = await recipeSiteService.getRecipeSites();
      setRecipeSites(sites);
    } catch (error) {
      console.error('Error loading recipe sites:', error);
    } finally {
      setLoadingRecipeSites(false);
    }
  };

  // Load users and stats
  const loadData = async () => {
    setError(null);
    setLoadingUsers(true);
    const errors: string[] = [];

    try {
      // Get system stats with error handling
      try {
        const stats = await adminService.getSystemStats();
        setSystemStats(stats);
      } catch (statsError: unknown) {
        console.error('Error loading system stats:', statsError);
        errors.push('Failed to load system statistics');
      }

      // Get all unique user IDs from collections with individual error handling
      const userIds = new Set<string>();
      
      // Load foodItems
      try {
        const foodItems = await getDocs(collection(db, 'foodItems'));
        foodItems.forEach(doc => {
          const userId = doc.data()?.userId;
          if (userId && typeof userId === 'string') {
            userIds.add(userId);
          }
        });
      } catch (foodError: unknown) {
        console.error('Error loading foodItems:', foodError);
        errors.push('Failed to load food items collection');
      }

      // Load shoppingLists
      try {
        const shoppingLists = await getDocs(collection(db, 'shoppingLists'));
        shoppingLists.forEach(doc => {
          const userId = doc.data()?.userId;
          if (userId && typeof userId === 'string') {
            userIds.add(userId);
          }
        });
      } catch (shoppingError: unknown) {
        console.error('Error loading shoppingLists:', shoppingError);
        errors.push('Failed to load shopping lists collection');
      }

      // Load userItems
      try {
        const userItems = await getDocs(collection(db, 'userItems'));
        userItems.forEach(doc => {
          const userId = doc.data()?.userId;
          if (userId && typeof userId === 'string') {
            userIds.add(userId);
          }
        });
      } catch (userItemsError: unknown) {
        console.error('Error loading userItems:', userItemsError);
        errors.push('Failed to load user items collection');
      }

      // Load userSettings and collect emails and usernames
      const userEmails = new Map<string, string>();
      const userUsernames = new Map<string, string>();
      try {
        const userSettings = await getDocs(collection(db, 'userSettings'));
        userSettings.forEach(doc => {
          const userId = doc.id;
          if (userId && typeof userId === 'string') {
            userIds.add(userId);
            const settingsData = doc.data();
            if (settingsData?.email) {
              userEmails.set(userId, settingsData.email);
            }
            if (settingsData?.username) {
              userUsernames.set(userId, settingsData.username);
            }
          }
        });
        
        // Also try to get email and username from current user's auth if available
        if (user && user.email && user.uid) {
          if (!userEmails.has(user.uid)) {
            userEmails.set(user.uid, user.email);
          }
          // Extract username from email if not already set
          if (!userUsernames.has(user.uid) && user.email) {
            const emailParts = user.email.split('@');
            if (emailParts.length > 0 && emailParts[0]) {
              userUsernames.set(user.uid, emailParts[0].toLowerCase().trim());
            }
          }
        }
      } catch (settingsError: unknown) {
        console.error('Error loading userSettings:', settingsError);
        errors.push('Failed to load user settings collection');
      }

      // Get stats for each user with error handling
      const userInfos: UserInfo[] = [];
      for (const uid of userIds) {
        try {
          const stats = await adminService.getUserStats(uid);
          const email = userEmails.get(uid);
          const username = userUsernames.get(uid);
          
          userInfos.push({
            uid,
            email: email,
            username: username,
            ...stats,
          });
        } catch (userStatsError: unknown) {
          console.error(`Error loading stats for user ${uid}:`, userStatsError);
          // Skip this user but continue with others
          // Optionally add user with zero stats
          const email = userEmails.get(uid);
          const username = userUsernames.get(uid);
          
          userInfos.push({
            uid,
            email: email,
            username: username,
            foodItemsCount: 0,
            userItemsCount: 0,
          });
        }
      }

      // Sort by food items count (descending)
      userInfos.sort((a, b) => b.foodItemsCount - a.foodItemsCount);
      setUsers(userInfos);

      // Set error message if any errors occurred
      if (errors.length > 0) {
        setError(`Some data failed to load: ${errors.join(', ')}. Partial data is shown below.`);
      }
    } catch (error: unknown) {
      const errorInfo = getErrorInfo(error);
      console.error('Unexpected error loading admin data:', error);
      setError(`Failed to load admin data: ${errorInfo.message || 'Unknown error'}`);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    loadData();
    loadAnalytics();
    loadRecipeSites();
    loadMasterFoodList();
  }, [isAdmin]);

  // Load analytics data
  const loadAnalytics = async () => {
    if (!isAdmin) return;
    
    setLoadingAnalytics(true);
    setAnalyticsError(null);
    try {
      const [overview, retention, funnel, engagement] = await Promise.all([
        analyticsAggregationService.calculateDashboardOverview(),
        analyticsAggregationService.calculateRetentionRates(),
        analyticsAggregationService.calculateFunnelConversion(),
        analyticsAggregationService.calculateEngagementMetrics(),
      ]);
      
      setAnalyticsOverview(overview);
      setRetentionMetrics(retention);
      setFunnelMetrics(funnel);
      setEngagementMetrics(engagement);
    } catch (error: unknown) {
      const errorInfo = getErrorInfo(error);
      console.error('Error loading analytics:', error);
      setAnalyticsError(`Failed to load analytics: ${errorInfo.message || 'Unknown error'}`);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  // Toggle section expansion
  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm(`Are you sure you want to delete all data for user ${userId}? This action cannot be undone.`)) {
      return;
    }

    setDeletingUserId(userId);
    try {
      await adminService.deleteUserData(userId);
      // Remove from users list
      setUsers(users.filter(u => u.uid !== userId));
      // Update stats
      try {
        const stats = await adminService.getSystemStats();
        setSystemStats(stats);
      } catch (statsError: unknown) {
        console.error('Error updating stats after deletion:', statsError);
        // Don't show error for stats update failure
      }
      // Remove error message if deletion was successful
      setError(null);
    } catch (error: unknown) {
      const errorInfo = getErrorInfo(error);
      console.error('Error deleting user:', error);
      setError(`Failed to delete user data: ${errorInfo.message || 'Unknown error'}`);
    } finally {
      setDeletingUserId(null);
    }
  };

  // Recipe site handlers
  const handleCreateRecipeSite = () => {
    setEditingRecipeSite(null);
    setRecipeSiteForm({
      label: '',
      baseUrl: '',
      searchTemplateUrl: '',
      enabled: true
    });
    setShowRecipeSiteForm(true);
  };

  const handleEditRecipeSite = (site: RecipeSite) => {
    setEditingRecipeSite(site);
    setRecipeSiteForm({
      label: site.label,
      baseUrl: site.baseUrl,
      searchTemplateUrl: site.searchTemplateUrl,
      enabled: site.enabled
    });
    setShowRecipeSiteForm(true);
  };

  const handleSaveRecipeSite = async () => {
    if (!recipeSiteForm.label || !recipeSiteForm.baseUrl || !recipeSiteForm.searchTemplateUrl) {
      alert('Please fill in all required fields');
      return;
    }

    if (!recipeSiteForm.searchTemplateUrl.includes('{query}')) {
      alert('Search Template URL must contain {query} placeholder');
      return;
    }

    setSavingRecipeSite(true);
    try {
      if (editingRecipeSite) {
        await recipeSiteService.updateRecipeSite(editingRecipeSite.id, recipeSiteForm);
      } else {
        await recipeSiteService.createRecipeSite(recipeSiteForm);
      }
      await loadRecipeSites();
      setShowRecipeSiteForm(false);
      setEditingRecipeSite(null);
      setRecipeSiteForm({
        label: '',
        baseUrl: '',
        searchTemplateUrl: '',
        enabled: true
      });
    } catch (error) {
      console.error('Error saving recipe site:', error);
      alert('Failed to save recipe site. Please try again.');
    } finally {
      setSavingRecipeSite(false);
    }
  };

  const handleDeleteRecipeSite = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this recipe site?')) {
      return;
    }

    try {
      await recipeSiteService.deleteRecipeSite(id);
      await loadRecipeSites();
    } catch (error) {
      console.error('Error deleting recipe site:', error);
      alert('Failed to delete recipe site. Please try again.');
    }
  };

  // Master Food List handlers
  const loadMasterFoodList = async () => {
    if (!isAdmin || !user?.email) return;
    setLoadingMasterFoodList(true);
    setMasterFoodListError(null);
    try {
      const items = await getAllMasterFoodItems();
      setMasterFoodItems(items);
      
      // Load categories
      const categories = await getMasterFoodListCategories();
      setMasterFoodListCategories(categories);
    } catch (error: unknown) {
      const errorInfo = getErrorInfo(error);
      console.error('Error loading master food list:', error);
      setMasterFoodListError(`Failed to load master food list: ${errorInfo.message || 'Unknown error'}`);
    } finally {
      setLoadingMasterFoodList(false);
    }
  };

  const handleCreateMasterFoodItem = () => {
    setEditingMasterFoodItem(null);
    setMasterFoodListForm({
      name: '',
      category: '',
      refrigeratorDays: null,
      freezerDays: null,
      pantryDays: null
    });
    setShowMasterFoodListForm(true);
  };

  const handleEditMasterFoodItem = (item: MasterFoodListItem) => {
    setEditingMasterFoodItem(item);
    setMasterFoodListForm({
      name: item.name,
      category: item.category,
      refrigeratorDays: item.refrigeratorDays ?? null,
      freezerDays: item.freezerDays ?? null,
      pantryDays: item.pantryDays ?? null
    });
    setShowMasterFoodListForm(true);
  };

  const handleSaveMasterFoodItem = async () => {
    if (!user?.email) {
      alert('You must be logged in to save food items');
      return;
    }

    if (!masterFoodListForm.name || !masterFoodListForm.name.trim()) {
      alert('Food item name is required');
      return;
    }

    if (!masterFoodListForm.category || !masterFoodListForm.category.trim()) {
      alert('Food item category is required');
      return;
    }

    setSavingMasterFoodItem(true);
    try {
      if (editingMasterFoodItem) {
        // Update existing item
        await updateMasterFoodItem(editingMasterFoodItem.id, masterFoodListForm, user.email);
        showToast('Food item updated successfully', 'success');
      } else {
        // Create new item
        await createMasterFoodItem(masterFoodListForm, user.email);
        showToast('Food item created successfully', 'success');
      }
      
      // Clear cache so changes are reflected immediately
      clearFoodKeeperCache();
      
      await loadMasterFoodList();
      setShowMasterFoodListForm(false);
      setEditingMasterFoodItem(null);
      setMasterFoodListForm({
        name: '',
        category: '',
        refrigeratorDays: null,
        freezerDays: null,
        pantryDays: null
      });
    } catch (error: unknown) {
      const errorInfo = getErrorInfo(error);
      console.error('Error saving master food item:', error);
      alert(`Failed to save food item: ${errorInfo.message || 'Unknown error'}`);
    } finally {
      setSavingMasterFoodItem(false);
    }
  };

  const handleDeleteMasterFoodItem = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}" from the master food list?`)) {
      return;
    }

    try {
      await deleteMasterFoodItem(id);
      showToast('Food item deleted successfully', 'success');
      
      // Clear cache so changes are reflected immediately
      clearFoodKeeperCache();
      
      await loadMasterFoodList();
    } catch (error: unknown) {
      const errorInfo = getErrorInfo(error);
      console.error('Error deleting master food item:', error);
      alert(`Failed to delete food item: ${errorInfo.message || 'Unknown error'}`);
    }
  };

  const handleImportFromJSON = async () => {
    if (!user?.email) {
      alert('You must be logged in to import food items');
      return;
    }

    if (!window.confirm(`This will import ${(foodkeeperData as FoodKeeperItem[]).length} food items from the JSON file. Items that already exist will be skipped. Continue?`)) {
      return;
    }

    setImportingFromJSON(true);
    try {
      const result = await importFromJSON(foodkeeperData as FoodKeeperItem[], user.email);
      showToast(`Import complete: ${result.imported} imported, ${result.skipped} skipped, ${result.errors} errors`, 'success');
      
      // Clear cache so changes are reflected immediately
      clearFoodKeeperCache();
      
      await loadMasterFoodList();
    } catch (error: unknown) {
      const errorInfo = getErrorInfo(error);
      console.error('Error importing from JSON:', error);
      alert(`Failed to import from JSON: ${errorInfo.message || 'Unknown error'}`);
    } finally {
      setImportingFromJSON(false);
    }
  };

  // Filter master food items based on search and category
  const filteredMasterFoodItems = masterFoodItems.filter(item => {
    const matchesSearch = !masterFoodListSearch || 
      item.name.toLowerCase().includes(masterFoodListSearch.toLowerCase());
    const matchesCategory = !masterFoodListCategoryFilter || 
      item.category === masterFoodListCategoryFilter;
    return matchesSearch && matchesCategory;
  });

  // Populate missing emails/usernames
  const handlePopulateMissingEmails = async () => {
    if (!user?.email || !isAdmin) {
      alert('You must be an admin to perform this action');
      return;
    }

    // Get users without email or username
    const usersNeedingUpdate = users.filter(u => !u.email || !u.username);
    
    if (usersNeedingUpdate.length === 0) {
      showToast('All users already have email and username', 'info');
      return;
    }

    if (!window.confirm(`This will populate missing emails and usernames for ${usersNeedingUpdate.length} user(s). Continue?`)) {
      return;
    }

    setPopulatingEmails(true);
    try {
      const userIds = usersNeedingUpdate.map(u => u.uid);
      const result = await adminService.populateUserEmails(userIds);
      
      showToast(
        `Migration complete: ${result.updated} updated, ${result.errors} errors, ${result.processed - result.updated - result.errors} already had data`,
        result.errors > 0 ? 'warning' : 'success'
      );
      
      // Reload user data
      await loadData();
    } catch (error: unknown) {
      const errorInfo = getErrorInfo(error);
      console.error('Error populating emails:', error);
      alert(`Failed to populate emails: ${errorInfo.message || 'Unknown error'}`);
    } finally {
      setPopulatingEmails(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <>
      <Banner onMenuClick={() => setMenuOpen(true)} />

      {/* Main Content */}
      <div style={{ padding: '1rem', maxWidth: '1200px', margin: '0 auto', paddingTop: '1.5rem', paddingBottom: '2rem' }}>
        {/* Error Message */}
        {error && (
          <div style={{
            padding: '1rem',
            backgroundColor: '#fee2e2',
            border: '1px solid #ef4444',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            color: '#991b1b'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{error}</span>
              <button
                onClick={() => loadData()}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#991b1b',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  fontSize: '0.875rem',
                  marginLeft: '1rem'
                }}
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Statistics Section */}
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.5rem', fontWeight: '600', color: '#1f2937' }}>
            System Statistics
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            marginBottom: '2rem'
          }}>
            <div style={{
              padding: '1.5rem',
              backgroundColor: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Total Users</div>
              <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1f2937' }}>{systemStats.totalUsers}</div>
            </div>
            <div style={{
              padding: '1.5rem',
              backgroundColor: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Total Food Items</div>
              <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1f2937' }}>{systemStats.totalFoodItems}</div>
            </div>
            <div style={{
              padding: '1.5rem',
              backgroundColor: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Total Shopping Lists</div>
              <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1f2937' }}>{systemStats.totalShoppingLists}</div>
            </div>
            <div style={{
              padding: '1.5rem',
              backgroundColor: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Total User Items</div>
              <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1f2937' }}>{systemStats.totalUserItems}</div>
            </div>
          </div>
        </div>

        {/* Analytics Section */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: '0', fontSize: '1.5rem', fontWeight: '600', color: '#1f2937' }}>
              Analytics Dashboard
            </h2>
            {analyticsError && (
              <button
                onClick={loadAnalytics}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#002B4D',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  cursor: 'pointer'
                }}
              >
                Retry
              </button>
            )}
          </div>

          {analyticsError && (
            <div style={{
              padding: '1rem',
              backgroundColor: '#fee2e2',
              border: '1px solid #ef4444',
              borderRadius: '8px',
              marginBottom: '1.5rem',
              color: '#991b1b'
            }}>
              {analyticsError}
            </div>
          )}
          
          {loadingAnalytics ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
              <p>Loading analytics...</p>
            </div>
          ) : (
            <>
              {/* Overview Section - Expanded by default */}
              <div style={{
                marginBottom: '1.5rem',
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
              }}>
                <button
                  onClick={() => toggleSection('overview')}
                  style={{
                    width: '100%',
                    padding: '1rem 1.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '1.25rem',
                    fontWeight: '600',
                    color: '#374151'
                  }}
                >
                  <span>Overview</span>
                  <span style={{ fontSize: '1.5rem', color: '#6b7280' }}>
                    {expandedSections.overview ? '−' : '+'}
                  </span>
                </button>
                {expandedSections.overview && (
                  <div style={{ padding: '0 1.5rem 1.5rem 1.5rem' }}>
                    {analyticsOverview ? (
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '1rem'
                      }}>
                        <div style={{
                          padding: '1.5rem',
                          backgroundColor: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px'
                        }}>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>New Users Today</div>
                          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1f2937' }}>{analyticsOverview.newUsersToday}</div>
                        </div>
                        <div style={{
                          padding: '1.5rem',
                          backgroundColor: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px'
                        }}>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>New Users This Week</div>
                          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1f2937' }}>{analyticsOverview.newUsersThisWeek}</div>
                        </div>
                        <div style={{
                          padding: '1.5rem',
                          backgroundColor: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px'
                        }}>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>New Users This Month</div>
                          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1f2937' }}>{analyticsOverview.newUsersThisMonth}</div>
                        </div>
                        <div style={{
                          padding: '1.5rem',
                          backgroundColor: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px'
                        }}>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Activation Rate</div>
                          <div style={{ fontSize: '2rem', fontWeight: '700', color: analyticsOverview.activationRate > 50 ? '#10b981' : analyticsOverview.activationRate > 25 ? '#f59e0b' : '#ef4444' }}>
                            {analyticsOverview.activationRate.toFixed(1)}%
                          </div>
                        </div>
                        <div style={{
                          padding: '1.5rem',
                          backgroundColor: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px'
                        }}>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Day 7 Retention</div>
                          <div style={{ fontSize: '2rem', fontWeight: '700', color: analyticsOverview.day7Retention > 40 ? '#10b981' : analyticsOverview.day7Retention > 20 ? '#f59e0b' : '#ef4444' }}>
                            {analyticsOverview.day7Retention.toFixed(1)}%
                          </div>
                        </div>
                        <div style={{
                          padding: '1.5rem',
                          backgroundColor: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px'
                        }}>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>WAU/MAU Ratio</div>
                          <div style={{ fontSize: '2rem', fontWeight: '700', color: analyticsOverview.wauMauRatio > 0.5 ? '#10b981' : analyticsOverview.wauMauRatio > 0.3 ? '#f59e0b' : '#ef4444' }}>
                            {analyticsOverview.wauMauRatio.toFixed(2)}
                          </div>
                        </div>
                        <div style={{
                          padding: '1.5rem',
                          backgroundColor: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px'
                        }}>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Avg Actions/Session</div>
                          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1f2937' }}>
                            {analyticsOverview.averageActionsPerSession.toFixed(1)}
                          </div>
                        </div>
                        <div style={{
                          padding: '1.5rem',
                          backgroundColor: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px'
                        }}>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Error Rate</div>
                          <div style={{ fontSize: '2rem', fontWeight: '700', color: analyticsOverview.errorRate < 1 ? '#10b981' : analyticsOverview.errorRate < 5 ? '#f59e0b' : '#ef4444' }}>
                            {analyticsOverview.errorRate.toFixed(2)}%
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                        No analytics data available yet. Metrics will appear as users interact with the app.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Acquisition Section */}
              <div style={{
                marginBottom: '1.5rem',
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
              }}>
                <button
                  onClick={() => toggleSection('acquisition')}
                  style={{
                    width: '100%',
                    padding: '1rem 1.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '1.25rem',
                    fontWeight: '600',
                    color: '#374151'
                  }}
                >
                  <span>Acquisition</span>
                  <span style={{ fontSize: '1.5rem', color: '#6b7280' }}>
                    {expandedSections.acquisition ? '−' : '+'}
                  </span>
                </button>
                {expandedSections.acquisition && (
                  <div style={{ padding: '0 1.5rem 1.5rem 1.5rem' }}>
                    <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                      Acquisition metrics will be displayed here. Check back soon for detailed acquisition data.
                    </div>
                  </div>
                )}
              </div>

              {/* Activation Section */}
              <div style={{
                marginBottom: '1.5rem',
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
              }}>
                <button
                  onClick={() => toggleSection('activation')}
                  style={{
                    width: '100%',
                    padding: '1rem 1.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '1.25rem',
                    fontWeight: '600',
                    color: '#374151'
                  }}
                >
                  <span>Activation</span>
                  <span style={{ fontSize: '1.5rem', color: '#6b7280' }}>
                    {expandedSections.activation ? '−' : '+'}
                  </span>
                </button>
                {expandedSections.activation && (
                  <div style={{ padding: '0 1.5rem 1.5rem 1.5rem' }}>
                    {analyticsOverview ? (
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                        gap: '1rem'
                      }}>
                        <div style={{
                          padding: '1.5rem',
                          backgroundColor: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px'
                        }}>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Activation Rate</div>
                          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1f2937' }}>
                            {analyticsOverview.activationRate.toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                        No activation data available yet.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Retention Section */}
              <div style={{
                marginBottom: '1.5rem',
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
              }}>
                <button
                  onClick={() => toggleSection('retention')}
                  style={{
                    width: '100%',
                    padding: '1rem 1.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '1.25rem',
                    fontWeight: '600',
                    color: '#374151'
                  }}
                >
                  <span>Retention</span>
                  <span style={{ fontSize: '1.5rem', color: '#6b7280' }}>
                    {expandedSections.retention ? '−' : '+'}
                  </span>
                </button>
                {expandedSections.retention && (
                  <div style={{ padding: '0 1.5rem 1.5rem 1.5rem' }}>
                    {retentionMetrics ? (
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '1rem'
                      }}>
                        <div style={{
                          padding: '1.5rem',
                          backgroundColor: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px'
                        }}>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Daily Active Users</div>
                          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1f2937' }}>{retentionMetrics.dau}</div>
                        </div>
                        <div style={{
                          padding: '1.5rem',
                          backgroundColor: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px'
                        }}>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Weekly Active Users</div>
                          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1f2937' }}>{retentionMetrics.wau}</div>
                        </div>
                        <div style={{
                          padding: '1.5rem',
                          backgroundColor: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px'
                        }}>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Monthly Active Users</div>
                          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1f2937' }}>{retentionMetrics.mau}</div>
                        </div>
                        <div style={{
                          padding: '1.5rem',
                          backgroundColor: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px'
                        }}>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Day 1 Retention</div>
                          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1f2937' }}>{retentionMetrics.day1Retention.toFixed(1)}%</div>
                        </div>
                        <div style={{
                          padding: '1.5rem',
                          backgroundColor: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px'
                        }}>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Day 7 Retention</div>
                          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1f2937' }}>{retentionMetrics.day7Retention.toFixed(1)}%</div>
                        </div>
                        <div style={{
                          padding: '1.5rem',
                          backgroundColor: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px'
                        }}>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Day 30 Retention</div>
                          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1f2937' }}>{retentionMetrics.day30Retention.toFixed(1)}%</div>
                        </div>
                        <div style={{
                          padding: '1.5rem',
                          backgroundColor: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px'
                        }}>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>WAU/MAU Ratio</div>
                          <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1f2937' }}>{retentionMetrics.wauMauRatio.toFixed(2)}</div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                        No retention data available yet.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Engagement Section */}
              <div style={{
                marginBottom: '1.5rem',
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
              }}>
                <button
                  onClick={() => toggleSection('engagement')}
                  style={{
                    width: '100%',
                    padding: '1rem 1.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '1.25rem',
                    fontWeight: '600',
                    color: '#374151'
                  }}
                >
                  <span>Engagement</span>
                  <span style={{ fontSize: '1.5rem', color: '#6b7280' }}>
                    {expandedSections.engagement ? '−' : '+'}
                  </span>
                </button>
                {expandedSections.engagement && (
                  <div style={{ padding: '0 1.5rem 1.5rem 1.5rem' }}>
                    {engagementMetrics ? (
                      <>
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                          gap: '1rem',
                          marginBottom: '1.5rem'
                        }}>
                          <div style={{
                            padding: '1.5rem',
                            backgroundColor: '#f9fafb',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px'
                          }}>
                            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Avg Actions/Session</div>
                            <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1f2937' }}>
                              {engagementMetrics.averageActionsPerSession.toFixed(1)}
                            </div>
                          </div>
                          <div style={{
                            padding: '1.5rem',
                            backgroundColor: '#f9fafb',
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px'
                          }}>
                            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Avg Sessions/User</div>
                            <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1f2937' }}>
                              {engagementMetrics.averageSessionsPerUser.toFixed(1)}
                            </div>
                          </div>
                        </div>
                        {engagementMetrics.mostUsedFeatures.length > 0 && (
                          <div>
                            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.75rem', fontWeight: '600' }}>Most Used Features</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              {engagementMetrics.mostUsedFeatures.slice(0, 5).map((feature) => (
                                <div key={feature.feature} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', backgroundColor: '#f9fafb', borderRadius: '4px' }}>
                                  <span style={{ fontSize: '0.875rem', color: '#1f2937' }}>{feature.feature}</span>
                                  <span style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: '600' }}>{feature.usageCount} users</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                        No engagement data available yet.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Funnel Section */}
              <div style={{
                marginBottom: '1.5rem',
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
              }}>
                <button
                  onClick={() => toggleSection('funnel')}
                  style={{
                    width: '100%',
                    padding: '1rem 1.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '1.25rem',
                    fontWeight: '600',
                    color: '#374151'
                  }}
                >
                  <span>Funnel Analysis</span>
                  <span style={{ fontSize: '1.5rem', color: '#6b7280' }}>
                    {expandedSections.funnel ? '−' : '+'}
                  </span>
                </button>
                {expandedSections.funnel && (
                  <div style={{ padding: '0 1.5rem 1.5rem 1.5rem' }}>
                    {funnelMetrics ? (
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '1rem'
                      }}>
                        <div style={{
                          padding: '1.5rem',
                          backgroundColor: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px'
                        }}>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Visits</div>
                          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1f2937' }}>{funnelMetrics.visitCount}</div>
                        </div>
                        <div style={{
                          padding: '1.5rem',
                          backgroundColor: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px'
                        }}>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Signups</div>
                          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1f2937' }}>{funnelMetrics.signupCount}</div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                            {funnelMetrics.visitToSignupRate.toFixed(1)}% conversion
                          </div>
                        </div>
                        <div style={{
                          padding: '1.5rem',
                          backgroundColor: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px'
                        }}>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Activations</div>
                          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1f2937' }}>{funnelMetrics.activationCount}</div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                            {funnelMetrics.signupToActivationRate.toFixed(1)}% conversion
                          </div>
                        </div>
                        <div style={{
                          padding: '1.5rem',
                          backgroundColor: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px'
                        }}>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Return Usage</div>
                          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1f2937' }}>{funnelMetrics.returnUsageCount}</div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                            {funnelMetrics.activationToReturnRate.toFixed(1)}% conversion
                          </div>
                        </div>
                        <div style={{
                          padding: '1.5rem',
                          backgroundColor: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px'
                        }}>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Overall Conversion</div>
                          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1f2937' }}>{funnelMetrics.overallConversionRate.toFixed(1)}%</div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                        No funnel data available yet.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Quality Section */}
              <div style={{
                marginBottom: '1.5rem',
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
              }}>
                <button
                  onClick={() => toggleSection('quality')}
                  style={{
                    width: '100%',
                    padding: '1rem 1.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '1.25rem',
                    fontWeight: '600',
                    color: '#374151'
                  }}
                >
                  <span>Quality & Errors</span>
                  <span style={{ fontSize: '1.5rem', color: '#6b7280' }}>
                    {expandedSections.quality ? '−' : '+'}
                  </span>
                </button>
                {expandedSections.quality && (
                  <div style={{ padding: '0 1.5rem 1.5rem 1.5rem' }}>
                    {analyticsOverview ? (
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '1rem'
                      }}>
                        <div style={{
                          padding: '1.5rem',
                          backgroundColor: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px'
                        }}>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Error Rate</div>
                          <div style={{ fontSize: '2rem', fontWeight: '700', color: analyticsOverview.errorRate < 1 ? '#10b981' : analyticsOverview.errorRate < 5 ? '#f59e0b' : '#ef4444' }}>
                            {analyticsOverview.errorRate.toFixed(2)}%
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                        No quality data available yet.
                      </div>
                    )}
                  </div>
                )}
              </div>

            </>
          )}
        </div>

        {/* Recipe Sites Section */}
        <div style={{ marginBottom: '3rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: '0', fontSize: '1.5rem', fontWeight: '600', color: '#1f2937' }}>
              Recipe Sites Management
            </h2>
            <button
              onClick={handleCreateRecipeSite}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#002B4D',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '1rem',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Add Recipe Site
            </button>
          </div>

          {showRecipeSiteForm && (
            <div style={{
              marginBottom: '1.5rem',
              padding: '1.5rem',
              backgroundColor: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.125rem', fontWeight: '600' }}>
                {editingRecipeSite ? 'Edit Recipe Site' : 'Add New Recipe Site'}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                    Label *
                  </label>
                  <input
                    type="text"
                    value={recipeSiteForm.label}
                    onChange={(e) => setRecipeSiteForm({ ...recipeSiteForm, label: e.target.value })}
                    placeholder="e.g., AllRecipes"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '1rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                    Base URL *
                  </label>
                  <input
                    type="url"
                    value={recipeSiteForm.baseUrl}
                    onChange={(e) => setRecipeSiteForm({ ...recipeSiteForm, baseUrl: e.target.value })}
                    placeholder="https://www.allrecipes.com"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '1rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                    Search Template URL * (must contain {`{query}`})
                  </label>
                  <input
                    type="url"
                    value={recipeSiteForm.searchTemplateUrl}
                    onChange={(e) => setRecipeSiteForm({ ...recipeSiteForm, searchTemplateUrl: e.target.value })}
                    placeholder="https://www.allrecipes.com/search/results/?search={query}"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '1rem'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id="recipe-site-enabled"
                    checked={recipeSiteForm.enabled}
                    onChange={(e) => setRecipeSiteForm({ ...recipeSiteForm, enabled: e.target.checked })}
                    style={{
                      width: '1.25rem',
                      height: '1.25rem',
                      cursor: 'pointer'
                    }}
                  />
                  <label htmlFor="recipe-site-enabled" style={{ fontSize: '0.875rem', cursor: 'pointer' }}>
                    Enabled
                  </label>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => {
                      setShowRecipeSiteForm(false);
                      setEditingRecipeSite(null);
                      setRecipeSiteForm({
                        label: '',
                        baseUrl: '',
                        searchTemplateUrl: '',
                        enabled: true
                      });
                    }}
                    disabled={savingRecipeSite}
                    style={{
                      padding: '0.75rem 1.5rem',
                      backgroundColor: '#f3f4f6',
                      color: '#1f2937',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '1rem',
                      fontWeight: '500',
                      cursor: savingRecipeSite ? 'not-allowed' : 'pointer',
                      opacity: savingRecipeSite ? 0.5 : 1
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveRecipeSite}
                    disabled={savingRecipeSite}
                    style={{
                      padding: '0.75rem 1.5rem',
                      backgroundColor: savingRecipeSite ? '#9ca3af' : '#002B4D',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '1rem',
                      fontWeight: '500',
                      cursor: savingRecipeSite ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {savingRecipeSite ? 'Saving...' : (editingRecipeSite ? 'Update' : 'Create')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {loadingRecipeSites ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
              <p>Loading recipe sites...</p>
            </div>
          ) : recipeSites.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
              <p>No recipe sites configured. Add one to get started.</p>
            </div>
          ) : (
            <div style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 3fr 3fr 1fr 1fr',
                gap: '1rem',
                padding: '1rem',
                backgroundColor: '#f9fafb',
                borderBottom: '1px solid #e5e7eb',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.875rem'
              }}>
                <div>Label</div>
                <div>Base URL</div>
                <div>Search Template</div>
                <div style={{ textAlign: 'center' }}>Enabled</div>
                <div style={{ textAlign: 'center' }}>Actions</div>
              </div>
              {recipeSites.map((site) => (
                <div
                  key={site.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 3fr 3fr 1fr 1fr',
                    gap: '1rem',
                    padding: '1rem',
                    borderBottom: '1px solid #e5e7eb',
                    alignItems: 'center'
                  }}
                >
                  <div style={{ fontWeight: '500', color: '#1f2937' }}>{site.label}</div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', wordBreak: 'break-all' }}>{site.baseUrl}</div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', wordBreak: 'break-all' }}>{site.searchTemplateUrl}</div>
                  <div style={{ textAlign: 'center' }}>
                    <span style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      backgroundColor: site.enabled ? '#d1fae5' : '#fee2e2',
                      color: site.enabled ? '#065f46' : '#991b1b'
                    }}>
                      {site.enabled ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                    <button
                      onClick={() => handleEditRecipeSite(site)}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#002B4D',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        cursor: 'pointer'
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteRecipeSite(site.id)}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        cursor: 'pointer'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Master Food List Management Section */}
        <div style={{ marginBottom: '3rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: '0', fontSize: '1.5rem', fontWeight: '600', color: '#1f2937' }}>
              Master Food List Management
            </h2>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={handleImportFromJSON}
                disabled={importingFromJSON}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: importingFromJSON ? '#9ca3af' : '#059669',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  cursor: importingFromJSON ? 'not-allowed' : 'pointer'
                }}
              >
                {importingFromJSON ? 'Importing...' : 'Import from JSON'}
              </button>
              <button
                onClick={handleCreateMasterFoodItem}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#002B4D',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Add Food Item
              </button>
            </div>
          </div>

          {masterFoodListError && (
            <div style={{
              padding: '1rem',
              backgroundColor: '#fee2e2',
              border: '1px solid #ef4444',
              borderRadius: '8px',
              marginBottom: '1.5rem',
              color: '#991b1b'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{masterFoodListError}</span>
                <button
                  onClick={loadMasterFoodList}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#991b1b',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    fontSize: '0.875rem',
                    marginLeft: '1rem'
                  }}
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* Search and Filter */}
          <div style={{ 
            display: 'flex', 
            gap: '1rem', 
            marginBottom: '1.5rem',
            flexWrap: 'wrap'
          }}>
            <input
              type="text"
              placeholder="Search food items..."
              value={masterFoodListSearch}
              onChange={(e) => setMasterFoodListSearch(e.target.value)}
              style={{
                flex: '1',
                minWidth: '200px',
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '1rem'
              }}
            />
            <select
              value={masterFoodListCategoryFilter}
              onChange={(e) => setMasterFoodListCategoryFilter(e.target.value)}
              style={{
                padding: '0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '1rem',
                minWidth: '150px'
              }}
            >
              <option value="">All Categories</option>
              {masterFoodListCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Add/Edit Form */}
          {showMasterFoodListForm && (
            <div style={{
              marginBottom: '1.5rem',
              padding: '1.5rem',
              backgroundColor: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.125rem', fontWeight: '600' }}>
                {editingMasterFoodItem ? 'Edit Food Item' : 'Add New Food Item'}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                    Name *
                  </label>
                  <input
                    type="text"
                    value={masterFoodListForm.name}
                    onChange={(e) => setMasterFoodListForm({ ...masterFoodListForm, name: e.target.value })}
                    placeholder="e.g., Milk"
                    disabled={!!editingMasterFoodItem}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '1rem',
                      backgroundColor: editingMasterFoodItem ? '#f3f4f6' : '#ffffff'
                    }}
                  />
                  {editingMasterFoodItem && (
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      Name cannot be changed after creation
                    </p>
                  )}
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                    Category *
                  </label>
                  <input
                    type="text"
                    value={masterFoodListForm.category}
                    onChange={(e) => setMasterFoodListForm({ ...masterFoodListForm, category: e.target.value })}
                    placeholder="e.g., Dairy"
                    list="category-suggestions"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '1rem'
                    }}
                  />
                  <datalist id="category-suggestions">
                    {masterFoodListCategories.map(cat => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                      Refrigerator Days
                    </label>
                    <input
                      type="number"
                      value={masterFoodListForm.refrigeratorDays ?? ''}
                      onChange={(e) => setMasterFoodListForm({ 
                        ...masterFoodListForm, 
                        refrigeratorDays: e.target.value ? parseInt(e.target.value) : null 
                      })}
                      placeholder="Days"
                      min="0"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '1rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                      Freezer Days
                    </label>
                    <input
                      type="number"
                      value={masterFoodListForm.freezerDays ?? ''}
                      onChange={(e) => setMasterFoodListForm({ 
                        ...masterFoodListForm, 
                        freezerDays: e.target.value ? parseInt(e.target.value) : null 
                      })}
                      placeholder="Days"
                      min="0"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '1rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>
                      Pantry Days
                    </label>
                    <input
                      type="number"
                      value={masterFoodListForm.pantryDays ?? ''}
                      onChange={(e) => setMasterFoodListForm({ 
                        ...masterFoodListForm, 
                        pantryDays: e.target.value ? parseInt(e.target.value) : null 
                      })}
                      placeholder="Days"
                      min="0"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        fontSize: '1rem'
                      }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => {
                      setShowMasterFoodListForm(false);
                      setEditingMasterFoodItem(null);
                      setMasterFoodListForm({
                        name: '',
                        category: '',
                        refrigeratorDays: null,
                        freezerDays: null,
                        pantryDays: null
                      });
                    }}
                    disabled={savingMasterFoodItem}
                    style={{
                      padding: '0.75rem 1.5rem',
                      backgroundColor: '#f3f4f6',
                      color: '#1f2937',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '1rem',
                      fontWeight: '500',
                      cursor: savingMasterFoodItem ? 'not-allowed' : 'pointer',
                      opacity: savingMasterFoodItem ? 0.5 : 1
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveMasterFoodItem}
                    disabled={savingMasterFoodItem}
                    style={{
                      padding: '0.75rem 1.5rem',
                      backgroundColor: savingMasterFoodItem ? '#9ca3af' : '#002B4D',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '1rem',
                      fontWeight: '500',
                      cursor: savingMasterFoodItem ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {savingMasterFoodItem ? 'Saving...' : (editingMasterFoodItem ? 'Update' : 'Create')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Master Food List Table */}
          {loadingMasterFoodList ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
              <p>Loading master food list...</p>
            </div>
          ) : filteredMasterFoodItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
              <p>
                {masterFoodItems.length === 0 
                  ? 'No food items in master list. Click "Import from JSON" to import the default list, or "Add Food Item" to create one.'
                  : 'No food items match your search/filter criteria.'}
              </p>
            </div>
          ) : (
            <div style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              maxHeight: '600px',
              overflowY: 'auto'
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr 1fr',
                gap: '1rem',
                padding: '1rem',
                backgroundColor: '#f9fafb',
                borderBottom: '1px solid #e5e7eb',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.875rem',
                position: 'sticky',
                top: 0,
                zIndex: 10
              }}>
                <div>Name</div>
                <div>Category</div>
                <div style={{ textAlign: 'center' }}>Refrigerator</div>
                <div style={{ textAlign: 'center' }}>Freezer</div>
                <div style={{ textAlign: 'center' }}>Pantry</div>
                <div style={{ textAlign: 'center' }}>Actions</div>
              </div>
              {filteredMasterFoodItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr 1fr',
                    gap: '1rem',
                    padding: '1rem',
                    borderBottom: '1px solid #e5e7eb',
                    alignItems: 'center'
                  }}
                >
                  <div style={{ fontWeight: '500', color: '#1f2937' }}>{item.name}</div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{item.category}</div>
                  <div style={{ textAlign: 'center', color: '#6b7280' }}>
                    {item.refrigeratorDays ?? '-'}
                  </div>
                  <div style={{ textAlign: 'center', color: '#6b7280' }}>
                    {item.freezerDays ?? '-'}
                  </div>
                  <div style={{ textAlign: 'center', color: '#6b7280' }}>
                    {item.pantryDays ?? '-'}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                    <button
                      onClick={() => handleEditMasterFoodItem(item)}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#002B4D',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        cursor: 'pointer'
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteMasterFoodItem(item.id, item.name)}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        cursor: 'pointer'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
              <div style={{
                padding: '1rem',
                backgroundColor: '#f9fafb',
                borderTop: '1px solid #e5e7eb',
                fontSize: '0.875rem',
                color: '#6b7280',
                textAlign: 'center'
              }}>
                Showing {filteredMasterFoodItems.length} of {masterFoodItems.length} items
              </div>
            </div>
          )}
        </div>

        {/* Users Section */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: '0', fontSize: '1.5rem', fontWeight: '600', color: '#1f2937' }}>
              User Management
            </h2>
            <button
              onClick={handlePopulateMissingEmails}
              disabled={populatingEmails}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: populatingEmails ? '#9ca3af' : '#059669',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: '500',
                cursor: populatingEmails ? 'not-allowed' : 'pointer'
              }}
            >
              {populatingEmails ? 'Populating...' : 'Populate Missing Emails/Usernames'}
            </button>
          </div>
          {loadingUsers ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
              <p>Loading users...</p>
            </div>
          ) : users.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
              <p>No users found.</p>
            </div>
          ) : (
            <div style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr',
                gap: '1rem',
                padding: '1rem',
                backgroundColor: '#f9fafb',
                borderBottom: '1px solid #e5e7eb',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.875rem'
              }}>
                <div>User ID</div>
                <div>Username</div>
                <div style={{ textAlign: 'center' }}>Food Items</div>
                <div style={{ textAlign: 'center' }}>User Items</div>
                <div style={{ textAlign: 'center' }}>Actions</div>
              </div>
              {users.map((userInfo) => (
                <div
                  key={userInfo.uid}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr',
                    gap: '1rem',
                    padding: '1rem',
                    borderBottom: '1px solid #e5e7eb',
                    alignItems: 'center'
                  }}
                >
                  <div style={{ fontFamily: 'monospace', fontSize: '0.875rem', color: '#1f2937', wordBreak: 'break-all' }}>
                    {userInfo.uid}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#374151' }}>
                    {userInfo.username || userInfo.email || 'Not available'}
                  </div>
                  <div style={{ textAlign: 'center', color: '#6b7280' }}>{userInfo.foodItemsCount}</div>
                  <div style={{ textAlign: 'center', color: '#6b7280' }}>{userInfo.userItemsCount}</div>
                  <div style={{ textAlign: 'center' }}>
                    <button
                      onClick={() => handleDeleteUser(userInfo.uid)}
                      disabled={deletingUserId === userInfo.uid}
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: deletingUserId === userInfo.uid ? '#9ca3af' : '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        cursor: deletingUserId === userInfo.uid ? 'not-allowed' : 'pointer',
                        opacity: deletingUserId === userInfo.uid ? 0.6 : 1
                      }}
                    >
                      {deletingUserId === userInfo.uid ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Hamburger Menu */}
      <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
};

export default Admin;

