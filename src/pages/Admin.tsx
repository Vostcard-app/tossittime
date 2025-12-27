import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase/firebaseConfig';
import { adminService } from '../services/adminService';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import HamburgerMenu from '../components/HamburgerMenu';

interface UserInfo {
  uid: string;
  email?: string;
  foodItemsCount: number;
  shoppingListsCount: number;
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

  // Load users and stats
  useEffect(() => {
    if (!isAdmin) return;

    const loadData = async () => {
      try {
        // Get system stats
        const stats = await adminService.getSystemStats();
        setSystemStats(stats);

        // Get all unique user IDs from collections
        const [foodItems, shoppingLists, userItems, userSettings] = await Promise.all([
          getDocs(collection(db, 'foodItems')),
          getDocs(collection(db, 'shoppingLists')),
          getDocs(collection(db, 'userItems')),
          getDocs(collection(db, 'userSettings')),
        ]);

        const userIds = new Set<string>();
        foodItems.forEach(doc => userIds.add(doc.data().userId));
        shoppingLists.forEach(doc => userIds.add(doc.data().userId));
        userItems.forEach(doc => userIds.add(doc.data().userId));
        userSettings.forEach(doc => userIds.add(doc.id));

        // Get stats for each user
        const userInfos: UserInfo[] = [];
        for (const uid of userIds) {
          const stats = await adminService.getUserStats(uid);
          userInfos.push({
            uid,
            ...stats,
          });
        }

        // Sort by food items count (descending)
        userInfos.sort((a, b) => b.foodItemsCount - a.foodItemsCount);
        setUsers(userInfos);
      } catch (error) {
        console.error('Error loading admin data:', error);
        alert('Failed to load admin data');
      }
    };

    loadData();
  }, [isAdmin]);

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
      const stats = await adminService.getSystemStats();
      setSystemStats(stats);
      alert('User data deleted successfully');
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Failed to delete user data');
    } finally {
      setDeletingUserId(null);
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
      {/* Banner Header */}
      <div style={{
        backgroundColor: '#002B4D',
        color: '#ffffff',
        padding: '1rem',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={() => navigate('/shop')}
              style={{
                background: 'none',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                padding: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
              aria-label="Go back"
            >
              ←
            </button>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700', color: '#ffffff' }}>
              Admin Panel
            </h1>
          </div>
          <button
            onClick={() => setMenuOpen(true)}
            style={{
              background: 'none',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              padding: '0.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              alignItems: 'center',
              justifyContent: 'center',
              width: '44px',
              height: '44px',
              minWidth: '44px',
              minHeight: '44px',
              borderRadius: '4px',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            aria-label="Open menu"
          >
            <div style={{ width: '24px', height: '3px', backgroundColor: '#ffffff', borderRadius: '2px' }}></div>
            <div style={{ width: '24px', height: '3px', backgroundColor: '#ffffff', borderRadius: '2px' }}></div>
            <div style={{ width: '24px', height: '3px', backgroundColor: '#ffffff', borderRadius: '2px' }}></div>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ padding: '1rem', maxWidth: '1200px', margin: '0 auto', paddingTop: '1.5rem', paddingBottom: '2rem' }}>
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

        {/* Users Section */}
        <div>
          <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.5rem', fontWeight: '600', color: '#1f2937' }}>
            User Management
          </h2>
          {users.length === 0 ? (
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
                gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                gap: '1rem',
                padding: '1rem',
                backgroundColor: '#f9fafb',
                borderBottom: '1px solid #e5e7eb',
                fontWeight: '600',
                color: '#374151',
                fontSize: '0.875rem'
              }}>
                <div>User ID</div>
                <div style={{ textAlign: 'center' }}>Food Items</div>
                <div style={{ textAlign: 'center' }}>Shopping Lists</div>
                <div style={{ textAlign: 'center' }}>User Items</div>
                <div style={{ textAlign: 'center' }}>Actions</div>
              </div>
              {users.map((userInfo) => (
                <div
                  key={userInfo.uid}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                    gap: '1rem',
                    padding: '1rem',
                    borderBottom: '1px solid #e5e7eb',
                    alignItems: 'center'
                  }}
                >
                  <div style={{ fontFamily: 'monospace', fontSize: '0.875rem', color: '#1f2937', wordBreak: 'break-all' }}>
                    {userInfo.uid}
                  </div>
                  <div style={{ textAlign: 'center', color: '#6b7280' }}>{userInfo.foodItemsCount}</div>
                  <div style={{ textAlign: 'center', color: '#6b7280' }}>{userInfo.shoppingListsCount}</div>
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

