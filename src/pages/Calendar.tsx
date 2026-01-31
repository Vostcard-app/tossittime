import React, { useMemo, useState, useEffect } from 'react';
import { Calendar as BigCalendar, dateFnsLocalizer } from 'react-big-calendar';
import type { View, Event } from 'react-big-calendar';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase/firebaseConfig';
import { useFoodItems } from '../hooks/useFoodItems';
import { getFoodItemStatus, getStatusColor } from '../utils/statusUtils';
import HamburgerMenu from '../components/layout/HamburgerMenu';
import Banner from '../components/layout/Banner';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { addDays, startOfDay, format, parse, startOfWeek, getDay, eachDayOfInterval, isSameDay } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import { analyticsService } from '../services/analyticsService';
import type { CalendarLocationState } from '../types';

const locales = {
  'en-US': enUS,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

interface CalendarEvent extends Event {
  resource: {
    itemId: string;
    status: 'fresh' | 'bestBySoon' | 'pastBestBy';
    rowIndex?: number; // For vertical stacking in day/week views
    isAdjacentToYellow?: boolean; // Flag for red expiration day adjacent to yellow span
    isThawDate?: boolean; // Flag for thaw date events (orange color)
    isFreezeDate?: boolean; // Flag for freeze date events
  };
}

const Calendar: React.FC = () => {
  const [user] = useAuthState(auth);
  const { foodItems, loading } = useFoodItems(user || null, { defer: 100 });
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  
  // Track calendar view
  useEffect(() => {
    if (user) {
      analyticsService.trackEngagement(user.uid, 'calendar_viewed', {});
    }
  }, [user]);
  
  // Check if we should default to week view (from Dashboard navigation)
  const locationState = location.state as CalendarLocationState | null;
  const defaultViewFromState = locationState?.defaultView;
  const initialView = defaultViewFromState === 'week' ? 'week' : 'month';
  
  const [currentView, setCurrentView] = useState<View>(initialView);
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Swipe navigation state
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [touchEnd, setTouchEnd] = useState<{ x: number; y: number } | null>(null);

  // Navigation functions
  const navigateBackward = () => {
    if (currentView === 'month') {
      setCurrentDate(addDays(currentDate, -30));
    } else if (currentView === 'week') {
      setCurrentDate(addDays(currentDate, -7));
    } else {
      setCurrentDate(addDays(currentDate, -1));
    }
  };

  const navigateForward = () => {
    if (currentView === 'month') {
      setCurrentDate(addDays(currentDate, 30));
    } else if (currentView === 'week') {
      setCurrentDate(addDays(currentDate, 7));
    } else {
      setCurrentDate(addDays(currentDate, 1));
    }
  };

  // Convert food items to calendar events
  const events = useMemo<CalendarEvent[]>(() => {
    if (!foodItems.length) return [];

    const allEvents: CalendarEvent[] = [];
    
    // Sort items by how close they are to best by date/thawing (soonest first) for proper row ordering
    // Items with best by date/thawing today should be at the top, then tomorrow, etc.
    const today = startOfDay(new Date());
    const sortedItems = [...foodItems].sort((a, b) => {
      // Use thawDate for frozen items, bestByDate for regular items
      const dateA = a.isFrozen && a.thawDate ? new Date(a.thawDate) : (a.bestByDate ? new Date(a.bestByDate) : new Date());
      const dateB = b.isFrozen && b.thawDate ? new Date(b.thawDate) : (b.bestByDate ? new Date(b.bestByDate) : new Date());
      const daysUntilA = Math.ceil((dateA.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const daysUntilB = Math.ceil((dateB.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      // Sort by days until best by date/thaw (negative = past, 0 = today, positive = future)
      // Closest to best by date/thawing (smallest number) should be first
      return daysUntilA - daysUntilB;
    });

    let rowIndex = 0;

    sortedItems.forEach((item) => {
      const isFrozen = item.isFrozen || false;
      // Use thawDate for frozen items, bestByDate for regular items
      const dateField = isFrozen && item.thawDate ? item.thawDate : (item.bestByDate || new Date());
      const bestByDate = new Date(dateField);

      // Helper function to set time to midnight (00:00:00) for top positioning
      const setToMidnight = (date: Date): Date => {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        return d;
      };
      
      // Helper function to set time to end of day (23:59:59) for proper day spanning
      const setToEndOfDay = (date: Date): Date => {
        const d = new Date(date);
        d.setHours(23, 59, 59, 999);
        return d;
      };

      // If item is frozen, add only thaw date event
      if (isFrozen && item.thawDate) {
        // Thaw date for frozen items
        const thawDate = new Date(item.thawDate);
        
        // Add thaw date event only (orange color)
        allEvents.push({
          title: `${item.name}\n(Thaw)`,
          start: setToMidnight(thawDate),
          end: setToEndOfDay(thawDate),
          resource: {
            itemId: item.id,
            status: 'bestBySoon', // Use bestBySoon status but we'll override color to orange
            rowIndex: rowIndex,
            isThawDate: true, // Flag to identify thaw date events
          },
        } as CalendarEvent);
        
        // Skip normal best by date rendering for frozen items (thaw date replaces it)
        rowIndex++;
          return; // Don't process frozen items with normal best by date logic
      }

      // For all items (fresh, bestBySoon, and pastBestBy), 
      // Create: 2 yellow days (best by soon), 2 blue days (freeze), 1 red day (past best by)
      // Create individual events for each day (works for both week and day/month views)
      // Day -4: Yellow (best by soon)
        allEvents.push({
          title: item.name,
        start: setToMidnight(addDays(bestByDate, -4)),
        end: setToEndOfDay(addDays(bestByDate, -4)),
          resource: {
            itemId: item.id,
          status: 'bestBySoon',
            rowIndex: rowIndex,
          },
        } as CalendarEvent);
      
      // Day -3: Yellow (best by soon)
      allEvents.push({
            title: item.name,
        start: setToMidnight(addDays(bestByDate, -3)),
        end: setToEndOfDay(addDays(bestByDate, -3)),
            resource: {
              itemId: item.id,
              status: 'bestBySoon',
              rowIndex: rowIndex,
            },
      } as CalendarEvent);
          
      // Day -2: Blue (freeze)
          allEvents.push({
        title: item.name,
        start: setToMidnight(addDays(bestByDate, -2)),
        end: setToEndOfDay(addDays(bestByDate, -2)),
            resource: {
              itemId: item.id,
          status: 'bestBySoon', // Use bestBySoon status but isFreezeDate will override color
              rowIndex: rowIndex,
          isFreezeDate: true,
            },
          } as CalendarEvent);
      
      // Day -1: Blue (freeze)
            allEvents.push({
              title: item.name,
        start: setToMidnight(addDays(bestByDate, -1)),
        end: setToEndOfDay(addDays(bestByDate, -1)),
              resource: {
                itemId: item.id,
          status: 'bestBySoon', // Use bestBySoon status but isFreezeDate will override color
                rowIndex: rowIndex,
          isFreezeDate: true,
              },
            } as CalendarEvent);
          
      // Day 0: Red (past best by)
          allEvents.push({
            title: item.name,
            start: setToMidnight(bestByDate),
            end: setToEndOfDay(bestByDate),
            resource: {
              itemId: item.id,
          status: 'pastBestBy',
              rowIndex: rowIndex,
            },
          } as CalendarEvent);
        rowIndex++;
    });

    const bestBySoonEvents = allEvents.filter(e => e.resource.status === 'bestBySoon');
    
    // Verify: Ensure we have yellow events for all bestBySoon items
    const bestBySoonItems = sortedItems.filter(item => {
      // Use thawDate for frozen items, bestByDate for regular items
      const dateField = item.isFrozen && item.thawDate ? item.thawDate : (item.bestByDate || new Date());
      const expDate = new Date(dateField);
      // Frozen items don't have best by date status, so always return false
      if (item.isFrozen) return false;
      return getFoodItemStatus(expDate, 7) === 'bestBySoon';
    });
    if (bestBySoonItems.length > 0 && bestBySoonEvents.length === 0 && currentView === 'week') {
      console.error('❌ ERROR: No yellow events created for bestBySoon items!', {
        bestBySoonItemsCount: bestBySoonItems.length,
        bestBySoonItems: bestBySoonItems.map(i => i.name)
      });
    }

    return allEvents;
  }, [foodItems, currentView]);

  // Custom event style function
  const eventStyleGetter = (event: CalendarEvent) => {
    // Use orange color for thaw dates, blue for freeze dates, otherwise use status color
    let color: string;
    if (event.resource.isThawDate) {
      color = '#F4A261'; // Orange for thaw dates
    } else if (event.resource.isFreezeDate) {
      color = '#3b82f6'; // Blue for freeze dates
    } else {
      color = getStatusColor(event.resource.status);
    }
    const backgroundColor = color;
    const borderColor = color;
    const textColor = '#ffffff'; // White text for readability

    const baseStyle: React.CSSProperties = {
      backgroundColor,
      borderColor,
      color: textColor,
      border: `1px solid ${borderColor}`,
      borderRadius: '4px',
      padding: '2px 4px',
      fontSize: '0.875rem',
      fontWeight: '500',
    };
    
    // Add data attribute for CSS targeting
    const className = `calendar-event-${event.resource.status}`;

    // Position events vertically by row index in day/week views
    // Start from top (0px) and stack downward based on best by date proximity
    // Items closest to best by date (rowIndex 0) appear at the top
    if (currentView === 'day' || currentView === 'week') {
      const rowIndex = event.resource.rowIndex ?? 0;
      const rowHeight = 44; // Height per row in pixels
      const topPosition = rowIndex * rowHeight;
      // Force top position - this must override react-big-calendar's time-based positioning
      baseStyle.top = `${topPosition}px`;
      baseStyle.position = 'absolute' as React.CSSProperties['position'];
      baseStyle.bottom = 'auto';
      baseStyle.marginTop = '0px';
      // Set CSS variable for additional CSS override support
      (baseStyle as React.CSSProperties & { '--rbc-event-top'?: string })['--rbc-event-top'] = `${topPosition}px`;
      // Ensure z-index so events appear above grid lines
      baseStyle.zIndex = 1;
      // For week view, ensure spanning events can span multiple days
      if (currentView === 'week') {
        // Don't force width/left/right for spanning events - let react-big-calendar handle it
        baseStyle.width = 'auto';
        baseStyle.left = 'auto';
        baseStyle.right = 'auto';
      }
    }

    return {
      style: baseStyle,
      className: className,
    };
  };

  // Handle event click - navigate to add form with item to edit
  const handleSelectEvent = (event: CalendarEvent) => {
    const item = foodItems.find(fi => fi.id === event.resource.itemId);
    if (item) {
      navigate('/add', { state: { editingItem: item } });
    }
  };

  // Handle date click in month view - switch to day view
  const handleSelectSlot = ({ start }: { start: Date }) => {
    if (currentView === 'month') {
      setCurrentDate(start);
      setCurrentView('day');
    }
  };

  // Custom day cell renderer for month view (to show dots)
  const dayPropGetter = (date: Date) => {
    // Check if any event spans this date
    const dayEvents = events.filter((event) => {
      if (!event.start || !event.end) return false;
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);
      const checkDate = new Date(date);
      
      return checkDate >= eventStart && checkDate <= eventEnd;
    });

    if (dayEvents.length === 0) {
      return {};
    }

    // Get unique statuses for this day
    const statuses = new Set(dayEvents.map((e) => e.resource.status));
    const hasFresh = statuses.has('fresh');
    const hasBestBySoon = statuses.has('bestBySoon');
    const hasPastBestBy = statuses.has('pastBestBy');

    // Store status info in data attributes for CSS
    const statusClasses = [];
    if (hasFresh) statusClasses.push('has-fresh');
    if (hasBestBySoon) statusClasses.push('has-best-by-soon');
    if (hasPastBestBy) statusClasses.push('has-past-best-by');

    return {
      className: `calendar-day-with-events ${statusClasses.join(' ')}`,
    };
  };

  // Custom Week View Component (Gantt chart style)
  const CustomWeekView: React.FC = () => {
    // Get the week start (Sunday) and create array of 7 days
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
    const weekDays = eachDayOfInterval({
      start: weekStart,
      end: addDays(weekStart, 6)
    });

    // Filter out past best by items (items past their best by/thaw date)
    // Only show items that haven't passed their best by/thaw date yet - past best by items fall off the calendar
    // Frozen items use thawDate, regular items use bestByDate
    const today = startOfDay(new Date());
    const nonPastBestByItems = foodItems.filter(item => {
      const dateField = item.isFrozen && item.thawDate ? item.thawDate : (item.bestByDate || new Date());
      const bestByDate = new Date(dateField);
      const bestByDay = startOfDay(bestByDate);
      // Only show items that haven't passed their best by/thaw date yet (date is today or in the future)
      const isNotPastBestBy = bestByDay >= today;
      return isNotPastBestBy;
    });

    // Sort items by best by/thaw proximity (soonest first)
    const sortedItems = [...nonPastBestByItems].sort((a, b) => {
      const dateA = a.isFrozen && a.thawDate ? new Date(a.thawDate) : (a.bestByDate ? new Date(a.bestByDate) : new Date());
      const dateB = b.isFrozen && b.thawDate ? new Date(b.thawDate) : (b.bestByDate ? new Date(b.bestByDate) : new Date());
      const daysUntilA = Math.ceil((dateA.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const daysUntilB = Math.ceil((dateB.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return daysUntilA - daysUntilB;
    });

    // Calculate which columns a date falls into
    const getColumnIndex = (date: Date): number | null => {
      const dayStart = startOfDay(date);
      for (let i = 0; i < weekDays.length; i++) {
        if (isSameDay(dayStart, weekDays[i])) {
          return i;
        }
      }
      return null;
    };

    const rowHeight = 50; // Height of each row

    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', width: '100%', minWidth: 0, maxWidth: '100%', overflowX: 'hidden', backgroundColor: '#ffffff' }}>
        {/* Color Key */}
        <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', padding: '0.75rem', borderBottom: '1px solid #d1d5db', flexWrap: 'wrap', backgroundColor: '#ffffff', minHeight: '48px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div
              style={{
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                backgroundColor: '#eab308',
              }}
            />
            <span style={{ fontSize: '0.875rem' }}>Best By Soon</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div
              style={{
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                backgroundColor: '#3b82f6',
              }}
            />
            <span style={{ fontSize: '0.875rem' }}>Freeze</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div
              style={{
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                backgroundColor: '#ef4444',
              }}
            />
            <span style={{ fontSize: '0.875rem' }}>Expired</span>
          </div>
        </div>
        {/* Day headers */}
        <div style={{ display: 'flex', borderBottom: '2px solid #d1d5db', width: '100%', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box', backgroundColor: '#ffffff' }}>
          {weekDays.map((day, index) => (
            <div
              key={index}
              style={{
                flex: 1,
                minWidth: 0,
                padding: '0.5rem',
                textAlign: 'center',
                fontWeight: '600',
                borderRight: index < 6 ? '1px solid #d1d5db' : 'none',
                backgroundColor: isSameDay(day, today) ? '#e5e7eb' : '#ffffff'
              }}
            >
              <div style={{ fontSize: '0.875rem' }}>{format(day, 'EEE')}</div>
              <div style={{ fontSize: '1.25rem' }}>{format(day, 'd')}</div>
            </div>
          ))}
        </div>

        {/* Items rows */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', width: '100%', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box', backgroundColor: '#ffffff', minHeight: `${rowHeight * 3}px` }}>
          {sortedItems.length === 0 ? (
            // Show multiple empty grid rows when no items to make grid clearly visible
            Array.from({ length: 3 }).map((_, rowIndex) => (
              <div
                key={rowIndex}
                style={{
                  display: 'flex',
                  height: `${rowHeight}px`,
                  borderBottom: '1px solid #d1d5db',
                  alignItems: 'center',
                  position: 'relative',
                  width: '100%',
                  minWidth: 0,
                  maxWidth: '100%',
                  boxSizing: 'border-box',
                  backgroundColor: '#ffffff'
                }}
              >
                {weekDays.map((_, colIndex) => (
                  <div
                    key={colIndex}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      maxWidth: '100%',
                      boxSizing: 'border-box',
                      borderRight: colIndex < 6 ? '1px solid #d1d5db' : 'none',
                      backgroundColor: '#ffffff'
                    }}
                  />
                ))}
              </div>
            ))
          ) : (
            sortedItems.map((item) => {
            const isFrozen = item.isFrozen || false;
            
            // Handle frozen items separately
            if (isFrozen && item.thawDate) {
              // For frozen items: use thawDate only
              const thawDate = new Date(item.thawDate);
              
              const thawCol = getColumnIndex(thawDate);
              
              // Check if thaw date intersects with week
              if (thawCol === null) {
                return null;
              }
              
              // Render frozen item: only thaw date
              return (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    height: `${rowHeight}px`,
                    borderBottom: '1px solid #d1d5db',
                    alignItems: 'center',
                    position: 'relative',
                    width: '100%',
                    minWidth: 0,
                    maxWidth: '100%',
                    boxSizing: 'border-box',
                    backgroundColor: '#ffffff'
                  }}
                >
                  {weekDays.map((_, colIndex) => {
                    const isThawDay = colIndex === thawCol;
                    
                    if (isThawDay) {
                      return (
                        <div
                          key={colIndex}
                          className="calendar-week-event"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            navigate('/add', { state: { editingItem: item } });
                          }}
                          onTouchEnd={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            navigate('/add', { state: { editingItem: item } });
                          }}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            height: '100%',
                            backgroundColor: '#F4A261', // Orange for thaw
                            color: '#ffffff',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRight: colIndex < 6 ? '1px solid rgba(255, 255, 255, 0.3)' : 'none',
                            fontWeight: '500',
                            padding: '0 0.25rem',
                            position: 'relative',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            cursor: 'pointer',
                            touchAction: 'manipulation'
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', textAlign: 'center', fontSize: '0.875rem' }}>
                            {item.name}
                          </span>
                          <span style={{ fontSize: '0.75rem', opacity: 0.9, marginTop: '2px' }}>
                            (Thaw)
                          </span>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={colIndex}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          maxWidth: '100%',
                          boxSizing: 'border-box',
                          borderRight: colIndex < 6 ? '1px solid #d1d5db' : 'none',
                          backgroundColor: '#ffffff'
                        }}
                      />
                    );
                  })}
                </div>
              );
            }
            
            // Normal (non-frozen) items: Calculate 5-day span: 2 yellow, 2 blue, 1 red
            // For non-frozen items, use bestByDate
            if (!item.bestByDate) {
              return null; // Skip items without best by date
            }
            const bestByDate = new Date(item.bestByDate);
            const fourDaysBefore = addDays(bestByDate, -4);
            const threeDaysBefore = addDays(bestByDate, -3);
            const twoDaysBefore = addDays(bestByDate, -2);
            const oneDayBefore = addDays(bestByDate, -1);
            
            // Get column indices for the 5-day span
            const dayMinus4Col = getColumnIndex(fourDaysBefore);
            const dayMinus3Col = getColumnIndex(threeDaysBefore);
            const dayMinus2Col = getColumnIndex(twoDaysBefore);
            const dayMinus1Col = getColumnIndex(oneDayBefore);
            const redCol = getColumnIndex(bestByDate);
            
            // Check if any part of the span intersects with week
            const spanIntersectsWeek = dayMinus4Col !== null || dayMinus3Col !== null || 
                                      dayMinus2Col !== null || dayMinus1Col !== null || redCol !== null;
            
            // Only render if the span intersects with the current week view
            if (!spanIntersectsWeek) {
              return null;
            }
            
            // Check if we have any columns to render
            const allCols = [dayMinus4Col, dayMinus3Col, dayMinus2Col, dayMinus1Col, redCol].filter(col => col !== null) as number[];
            if (allCols.length === 0) return null;

            return (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  height: `${rowHeight}px`,
                  borderBottom: '1px solid #d1d5db',
                  alignItems: 'center',
                  position: 'relative',
                  width: '100%',
                  minWidth: 0,
                  maxWidth: '100%',
                  boxSizing: 'border-box',
                  backgroundColor: '#ffffff'
                }}
              >
                {weekDays.map((_, colIndex) => {
                  // Check if this column is part of the 5-day span
                  const isDayMinus4 = colIndex === dayMinus4Col;
                  const isDayMinus3 = colIndex === dayMinus3Col;
                  const isDayMinus2 = colIndex === dayMinus2Col;
                  const isDayMinus1 = colIndex === dayMinus1Col;
                  const isRedDay = colIndex === redCol;
                  const isInSpan = isDayMinus4 || isDayMinus3 || isDayMinus2 || isDayMinus1 || isRedDay;

                  if (isInSpan) {
                    // Determine color based on which day it is
                    let backgroundColor = '#eab308'; // Default yellow
                    if (isRedDay) {
                      backgroundColor = '#ef4444'; // Red for best by date day
                    } else if (isDayMinus2 || isDayMinus1) {
                      backgroundColor = '#3b82f6'; // Blue for days -2 and -1
                    } else if (isDayMinus4 || isDayMinus3) {
                      backgroundColor = '#eab308'; // Yellow for days -4 and -3
                    }
                    
                    return (
                      <div
                        key={colIndex}
                        className="calendar-week-event"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          navigate('/add', { state: { editingItem: item } });
                        }}
                        onTouchEnd={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          navigate('/add', { state: { editingItem: item } });
                        }}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          height: '100%',
                          backgroundColor: backgroundColor,
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRight: colIndex < 6 ? '1px solid rgba(255, 255, 255, 0.3)' : 'none',
                          fontWeight: '500',
                          padding: '0 0.25rem',
                          position: 'relative',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          cursor: 'pointer',
                          touchAction: 'manipulation'
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', textAlign: 'center' }}>
                          {item.name}
                        </span>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={colIndex}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        maxWidth: '100%',
                        boxSizing: 'border-box',
                        borderRight: colIndex < 6 ? '1px solid #d1d5db' : 'none',
                        backgroundColor: '#ffffff'
                      }}
                    />
                  );
                })}
              </div>
            );
          })
          )}
        </div>
      </div>
    );
  };

  // Custom event component
  const EventComponent = ({ event }: { event: CalendarEvent }) => {
    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      handleSelectEvent(event);
    };
    
    const handleTouchEnd = (e: React.TouchEvent) => {
      e.stopPropagation();
      handleSelectEvent(event);
    };
    // Check if this is a thaw date event
    const isThawEvent = event.resource.isThawDate;
    const itemName = isThawEvent ? (event.title as string).replace('\n(Thaw)', '') : (event.title as string);
    
    if (currentView === 'month') {
      // In month view, show item title with colored background
      const color = event.resource.isThawDate ? '#F4A261' : getStatusColor(event.resource.status);
      // Only show title if it's not empty (red best by date day adjacent to yellow has empty title)
      if (!event.title || event.title === '') {
        return null; // Don't render empty events in month view
      }
      return (
        <div
          onClick={handleClick}
          onTouchEnd={handleTouchEnd}
          style={{
            backgroundColor: color,
            color: '#ffffff',
            padding: '2px 4px',
            borderRadius: '4px',
            fontSize: '0.75rem',
            fontWeight: '500',
            whiteSpace: 'normal',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            cursor: 'pointer',
            maxWidth: '100%',
            display: 'flex',
            flexDirection: 'column',
            lineHeight: '1.2',
            touchAction: 'manipulation'
          }}
          title={event.title as string}
        >
          <span>{itemName}</span>
          {isThawEvent && <span style={{ fontSize: '0.7rem', opacity: 0.9 }}>(Thaw)</span>}
        </div>
      );
    }
    
    // In week/day view, show full event with title
    // For day view, also show best by date/thaw date
    if (currentView === 'day') {
      // Find the original item to get best by date/thaw date
      const item = foodItems.find((i) => i.id === event.resource.itemId);
      // Use thawDate for frozen items, bestByDate for regular items
      const dateField = item && item.isFrozen && item.thawDate ? item.thawDate : (item?.bestByDate || null);
      const bestByDate = dateField ? new Date(dateField) : null;
      const formattedDate = bestByDate ? format(bestByDate, 'MMM d, yyyy') : '';
      const dateLabel = item?.isFrozen ? 'Thaws' : 'Best By';
      
      return (
        <div 
          onClick={handleClick}
          onTouchEnd={handleTouchEnd}
          style={{ 
            padding: '2px 4px', 
            fontSize: '0.875rem',
            cursor: 'pointer',
            touchAction: 'manipulation'
          }}
        >
          <div style={{ fontWeight: '500' }}>{itemName}</div>
          {isThawEvent && <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>(Thaw)</div>}
          {formattedDate && (
            <div style={{ fontSize: '0.75rem', opacity: 0.9, marginTop: '2px' }}>
              {dateLabel}: {formattedDate}
            </div>
          )}
        </div>
      );
    }
    
    // Week view: show title only if not empty (red best by date day adjacent to yellow has empty title)
    if (event.resource.isAdjacentToYellow) {
      return <div style={{ padding: '2px 4px' }}></div>; // Empty div for red best by date day
    }
    // Show title for all other events (including yellow spanning events)
    // For thaw events, show name and (Thaw) on separate lines
    if (isThawEvent) {
      return (
        <div 
          onClick={handleClick}
          onTouchEnd={handleTouchEnd}
          style={{ 
            padding: '2px 4px', 
            display: 'flex', 
            flexDirection: 'column', 
            lineHeight: '1.2',
            cursor: 'pointer',
            touchAction: 'manipulation'
          }}
        >
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{itemName}</span>
          <span style={{ fontSize: '0.7rem', opacity: 0.9 }}>(Thaw)</span>
        </div>
      );
    }
    return (
      <div 
        onClick={handleClick}
        onTouchEnd={handleTouchEnd}
        style={{ 
          padding: '2px 4px', 
          whiteSpace: 'nowrap', 
          overflow: 'hidden', 
          textOverflow: 'ellipsis',
          cursor: 'pointer',
          touchAction: 'manipulation'
        }}
      >
        {event.title}
      </div>
    );
  };

  // Add custom CSS for month view and day view
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'calendar-custom-styles';
    style.textContent = `
      /* Month view styles */
      .rbc-month-view .rbc-event {
        border: none !important;
        background: transparent !important;
        padding: 2px 0 !important;
        margin: 1px 0 !important;
        height: auto !important;
        touch-action: manipulation !important;
        min-height: 0 !important;
        display: flex;
        align-items: flex-start;
      }
      .rbc-month-view .rbc-event-content {
        padding: 0 !important;
        width: 100% !important;
      }
      .rbc-month-view .rbc-day-slot .rbc-events-container {
        margin: 0 !important;
        display: flex;
        flex-direction: column;
        gap: 2px;
        gap: 2px;
        justify-content: center;
        align-items: center;
        padding-top: 2px;
      }
      
      /* Day and Week view styles - remove time column and make events full-width */
      .rbc-time-view .rbc-time-header {
        display: none !important;
      }
      .rbc-time-view .rbc-time-content {
        border-left: none !important;
      }
      .rbc-time-view .rbc-time-header-content {
        display: none !important;
      }
      .rbc-time-view .rbc-time-slot {
        display: none !important;
      }
      .rbc-time-view .rbc-day-slot {
        min-height: 0 !important;
      }
      .rbc-time-view .rbc-events-container {
        margin-left: 0 !important;
        width: 100% !important;
      }
      .rbc-time-view .rbc-event {
        width: 100% !important;
        max-width: 100% !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        touch-action: manipulation !important;
        cursor: pointer !important;
      }
      .rbc-time-view .rbc-event-content {
        width: 100% !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
      }
      
      /* Additional week view specific adjustments */
      .rbc-time-view.rbc-week-view .rbc-time-content {
        margin-left: 0 !important;
      }
      .rbc-time-view.rbc-week-view .rbc-day-slot {
        width: 100% !important;
      }
      
      /* Stack events vertically by row index in day/week views */
      .rbc-time-view .rbc-day-slot {
        position: relative;
        min-height: auto !important;
        padding-top: 0 !important;
      }
      .rbc-time-view .rbc-events-container {
        position: relative !important;
        min-height: 200px !important;
        padding-top: 0 !important;
        top: 0 !important;
        align-items: flex-start !important;
        margin-top: 0 !important;
      }
      .rbc-time-view .rbc-event {
        position: absolute !important;
        height: 40px !important;
        margin: 0 !important;
        margin-top: 0 !important;
        transform: none !important;
        /* Force events to use inline style top positioning from eventStyleGetter */
        /* Override any time-based positioning from react-big-calendar */
        top: var(--rbc-event-top, 0) !important;
        /* For multi-day spanning events, react-big-calendar handles left/right/width automatically */
        /* Don't force width: 100% as it breaks spanning events */
        display: flex !important;
        align-items: center !important;
        z-index: 1 !important;
      }
      /* Single day events should still be full width */
      .rbc-time-view .rbc-event:not(.rbc-event-continues-after):not(.rbc-event-continues-prior):not(.rbc-event-continues-earlier) {
        left: 0 !important;
        right: 0 !important;
        width: 100% !important;
      }
      /* Ensure spanning events are visible and properly styled - let react-big-calendar handle positioning */
      .rbc-time-view .rbc-event.rbc-event-continues-after,
      .rbc-time-view .rbc-event.rbc-event-continues-prior,
      .rbc-time-view .rbc-event.rbc-event-continues-earlier {
        /* Let react-big-calendar handle left/right/width for spanning events */
        /* But ensure they're visible */
        display: flex !important;
        visibility: visible !important;
        opacity: 1 !important;
      }
      /* Ensure all events with bestBySoon status are visible */
      .rbc-time-view .rbc-event.calendar-event-bestBySoon {
        display: flex !important;
        visibility: visible !important;
        opacity: 1 !important;
        background-color: #eab308 !important;
        border-color: #eab308 !important;
      }
      /* Debug: Make sure yellow events are visible - target by background color */
      .rbc-time-view .rbc-event[style*="rgb(234, 179, 8)"],
      .rbc-time-view .rbc-event[style*="#eab308"],
      .rbc-time-view .rbc-event[style*="background-color: rgb(234, 179, 8)"] {
        display: flex !important;
        visibility: visible !important;
        opacity: 1 !important;
      }
      /* Ensure yellow events are not hidden by any parent containers */
      .rbc-time-view .rbc-day-slot .rbc-events-container .rbc-event.calendar-event-bestBySoon {
        display: flex !important;
        visibility: visible !important;
        opacity: 1 !important;
      }
      /* Override react-big-calendar's time-based top calculation - more specific selectors */
      .rbc-time-view .rbc-day-slot .rbc-events-container .rbc-event {
        top: var(--rbc-event-top, 0) !important;
        margin-top: 0 !important;
      }
      /* Force all events to start from top, ignoring time-based calculations */
      .rbc-time-view .rbc-time-content .rbc-day-slot .rbc-events-container {
        top: 0 !important;
        padding-top: 0 !important;
      }
      /* Completely override react-big-calendar's time-based positioning */
      /* Use attribute selector to target events with our CSS variable */
      .rbc-time-view .rbc-event[style*="--rbc-event-top"] {
        /* Our inline style should take precedence */
      }
      /* Force events container to start at top of day slot */
      .rbc-time-view .rbc-day-slot .rbc-events-container {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: auto !important;
      }
      /* Make sure day slots don't have excessive height pushing events down */
      .rbc-time-view .rbc-day-slot {
        height: auto !important;
        min-height: 200px !important;
      }
      /* Override react-big-calendar's default time-based positioning */
      .rbc-time-view .rbc-event-label {
        display: none !important;
      }
      /* Reset any default top positioning from react-big-calendar */
      .rbc-time-view .rbc-time-content {
        padding-top: 0 !important;
      }
      /* Ensure events start from the very top */
      .rbc-time-view .rbc-time-slot {
        padding-top: 0 !important;
      }
      .rbc-time-view .rbc-time-gutter {
        display: none !important;
      }
      /* Darken today's date background */
      .rbc-today {
        background-color: #e5e7eb !important;
      }
      /* Override any time-based positioning from react-big-calendar */
      .rbc-time-view .rbc-day-slot .rbc-events-container .rbc-event {
        /* Remove any default top positioning that react-big-calendar might add */
        top: var(--rbc-event-top, 0) !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      const existingStyle = document.getElementById('calendar-custom-styles');
      if (existingStyle) {
        document.head.removeChild(existingStyle);
      }
    };
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Loading calendar...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Please log in to view the calendar.</p>
      </div>
    );
  }

  return (
    <>
      {/* Fixed Header: Banner and Navigation Buttons */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        backgroundColor: '#ffffff',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
      }}>
        <Banner showHomeIcon={false} onMenuClick={() => setMenuOpen(true)} maxWidth="1400px" />

        {/* Lists, Items, and Plan Buttons */}
        <div style={{ padding: '1rem', maxWidth: '1400px', margin: '0 auto', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <button
            onClick={() => navigate('/shop')}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#f3f4f6',
              color: '#1f2937',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: 'pointer',
              minHeight: '44px'
            }}
          >
            Lists
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#f3f4f6',
              color: '#1f2937',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: 'pointer',
              minHeight: '44px'
            }}
          >
            Items
          </button>
          <button
            onClick={() => navigate('/planned-meal-calendar')}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#f3f4f6',
              color: '#1f2937',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: 'pointer',
              minHeight: '44px'
            }}
          >
            Plan
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div 
        style={{ padding: '1rem', maxWidth: '1400px', margin: '0 auto', paddingTop: '1.5rem', paddingBottom: '2rem', width: '100%', boxSizing: 'border-box', overflowX: 'hidden', marginTop: '160px' }}
        onTouchStart={(e) => {
          // Don't capture touch if it's on an interactive element
          const target = e.target as HTMLElement;
          if (target.closest('button') || target.closest('.rbc-event') || target.closest('[role="button"]') || target.closest('a') || target.closest('.calendar-week-event')) {
            return;
          }
          const touch = e.touches[0];
          setTouchStart({ x: touch.clientX, y: touch.clientY });
          setTouchEnd(null);
        }}
        onTouchMove={(e) => {
          // Don't capture touch if it's on an interactive element
          const target = e.target as HTMLElement;
          if (target.closest('button') || target.closest('.rbc-event') || target.closest('[role="button"]') || target.closest('a') || target.closest('.calendar-week-event')) {
            return;
          }
          if (!touchStart) return;
          const touch = e.touches[0];
          setTouchEnd({ x: touch.clientX, y: touch.clientY });
        }}
        onTouchEnd={(e) => {
          // Don't capture touch if it's on an interactive element
          const target = e.target as HTMLElement;
          if (target.closest('button') || target.closest('.rbc-event') || target.closest('[role="button"]') || target.closest('a') || target.closest('.calendar-week-event')) {
            setTouchStart(null);
            setTouchEnd(null);
            return;
          }
          
          if (!touchStart || !touchEnd) {
            setTouchStart(null);
            setTouchEnd(null);
            return;
          }
          
          const distanceX = touchStart.x - touchEnd.x;
          const distanceY = Math.abs(touchStart.y - touchEnd.y);
          const minSwipeDistance = 50;
          
          // Only trigger if horizontal swipe is greater than vertical movement
          if (Math.abs(distanceX) > minSwipeDistance && Math.abs(distanceX) > distanceY) {
            if (distanceX > 0) {
              // Swipe left - go forward
              if (currentView === 'month') {
                setCurrentDate(addDays(currentDate, 30));
              } else if (currentView === 'week') {
                setCurrentDate(addDays(currentDate, 7));
              } else {
                setCurrentDate(addDays(currentDate, 1));
              }
            } else {
              // Swipe right - go backward
              if (currentView === 'month') {
                setCurrentDate(addDays(currentDate, -30));
              } else if (currentView === 'week') {
                setCurrentDate(addDays(currentDate, -7));
              } else {
                setCurrentDate(addDays(currentDate, -1));
              }
            }
          }
          
          setTouchStart(null);
          setTouchEnd(null);
        }}
      >
        {/* Date Range Display */}
        <div style={{ fontSize: '1rem', fontWeight: '500', marginBottom: '1rem', textAlign: 'center' }}>
          {currentView === 'month' ? (
            format(currentDate, 'MMMM yyyy')
          ) : currentView === 'week' ? (
            `${format(startOfWeek(currentDate, { weekStartsOn: 0 }), 'MMM d')} - ${format(addDays(startOfWeek(currentDate, { weekStartsOn: 0 }), 6), 'MMM d, yyyy')}`
          ) : (
            format(currentDate, 'MMM d, yyyy')
          )}
        </div>

        {/* View Buttons with Navigation */}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center', marginBottom: '1rem' }}>
          {/* Left chevrons - navigate backward */}
          <button
            onClick={navigateBackward}
            onTouchEnd={(e) => {
              e.stopPropagation();
              navigateBackward();
            }}
            style={{
              padding: '0.5rem 0.75rem',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '600',
              minWidth: '44px',
              minHeight: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              touchAction: 'manipulation'
            }}
            aria-label="Navigate backward"
          >
            «
          </button>
          
          {/* View buttons */}
          {['month', 'week', 'day'].map((view) => (
            <button
              key={view}
              onClick={() => setCurrentView(view as View)}
              onTouchEnd={(e) => {
                e.stopPropagation();
                setCurrentView(view as View);
              }}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: currentView === view ? '#002B4D' : '#f3f4f6',
                color: currentView === view ? '#ffffff' : '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                textTransform: 'capitalize',
                minHeight: '44px',
                touchAction: 'manipulation'
              }}
            >
              {view}
            </button>
          ))}
          
          {/* Right chevrons - navigate forward */}
          <button
            onClick={navigateForward}
            onTouchEnd={(e) => {
              e.stopPropagation();
              navigateForward();
            }}
            style={{
              padding: '0.5rem 0.75rem',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '600',
              minWidth: '44px',
              minHeight: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              touchAction: 'manipulation'
            }}
            aria-label="Navigate forward"
          >
            »
          </button>
        </div>
      <div style={{ height: '600px', backgroundColor: '#ffffff', borderRadius: '8px', padding: '1rem', width: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
        {currentView === 'week' ? (
          <CustomWeekView />
        ) : (
          <BigCalendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            style={{ height: '100%' }}
            view={currentView}
            onView={setCurrentView}
            date={currentDate}
            onNavigate={setCurrentDate}
            onSelectEvent={handleSelectEvent}
            onSelectSlot={handleSelectSlot}
            selectable
            eventPropGetter={eventStyleGetter}
            dayPropGetter={dayPropGetter}
            components={{
              event: EventComponent,
            }}
            views={['month', 'week', 'day']}
            defaultView="month"
          />
        )}
      </div>

      {/* Legend */}
      <div style={{ marginTop: '1rem', display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              backgroundColor: '#f59e0b',
            }}
          />
          <span style={{ fontSize: '0.875rem' }}>Expiring Soon</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              backgroundColor: '#3b82f6',
            }}
          />
          <span style={{ fontSize: '0.875rem' }}>Freeze</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              backgroundColor: '#ef4444',
            }}
          />
          <span style={{ fontSize: '0.875rem' }}>Expired</span>
        </div>
        </div>
      </div>

      {/* Hamburger Menu */}
      <HamburgerMenu isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
};

export default Calendar;
