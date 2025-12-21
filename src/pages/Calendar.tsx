import React, { useMemo, useState, useEffect } from 'react';
import { Calendar as BigCalendar, dateFnsLocalizer } from 'react-big-calendar';
import type { View, Event } from 'react-big-calendar';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../firebase/firebaseConfig';
import { useFoodItems } from '../hooks/useFoodItems';
import { getFoodItemStatus, getStatusColor } from '../utils/statusUtils';
import HamburgerMenu from '../components/HamburgerMenu';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { addDays, startOfDay, format, parse, startOfWeek, getDay, eachDayOfInterval, isSameDay } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';

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
    status: 'fresh' | 'expiring_soon' | 'expired';
    rowIndex?: number; // For vertical stacking in day/week views
    isAdjacentToYellow?: boolean; // Flag for red expiration day adjacent to yellow span
  };
}

const Calendar: React.FC = () => {
  const [user] = useAuthState(auth);
  const { foodItems, loading } = useFoodItems(user || null);
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  
  // Check if we should default to week view (from Dashboard navigation)
  const defaultViewFromState = (location.state as any)?.defaultView;
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
    
    // Sort items by how close they are to expiring (soonest first) for proper row ordering
    // Items expiring today should be at the top, then tomorrow, etc.
    const today = startOfDay(new Date());
    const sortedItems = [...foodItems].sort((a, b) => {
      const dateA = new Date(a.expirationDate);
      const dateB = new Date(b.expirationDate);
      const daysUntilA = Math.ceil((dateA.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const daysUntilB = Math.ceil((dateB.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      // Sort by days until expiration (negative = expired, 0 = today, positive = future)
      // Closest to expiring (smallest number) should be first
      return daysUntilA - daysUntilB;
    });

    let rowIndex = 0;

    sortedItems.forEach((item) => {
      const expirationDate = new Date(item.expirationDate);
      const status = getFoodItemStatus(expirationDate, 7); // Using default 7 days for expiring soon

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

      if (status === 'expired') {
        // Red: Show on expiration date and continue showing as red for expired items
        // For day view, show on the expiration date (react-big-calendar will filter by date)
        allEvents.push({
          title: item.name,
          start: setToMidnight(expirationDate),
          end: setToEndOfDay(expirationDate),
          resource: {
            itemId: item.id,
            status: 'expired',
            rowIndex: rowIndex,
          },
        } as CalendarEvent);
        rowIndex++;
      } else if (status === 'expiring_soon') {
        // ALWAYS create yellow 3-day event + red 1-day event for expiring_soon items
        if (currentView === 'week') {
          // Week view: Create a single spanning yellow event for 3 days before expiration
          // Event should span: [3 days before] to [1 day before expiration] = 3 days total
          const threeDaysBefore = addDays(expirationDate, -3);
          const dayBeforeExpiration = addDays(expirationDate, -1);
          let eventStart = setToMidnight(threeDaysBefore);
          // End at the end of day before expiration (23:59:59.999)
          // This ensures exactly 3 days: day -3, day -2, day -1
          let eventEnd = setToEndOfDay(dayBeforeExpiration);
          
          // Get the start of the current week view to ensure events are visible
          const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 }); // Sunday
          
          // If yellow event starts before the week view, adjust it to start at week start
          // This ensures the event is visible even if it starts before the current week
          const originalStart = eventStart;
          if (eventStart < weekStart) {
            eventStart = setToMidnight(weekStart);
          }
          
          // Verify date calculation creates exactly 3 days (or less if clipped to week start)
          // Calculate days: from start to end (inclusive)
          const calculatedDays = Math.ceil((eventEnd.getTime() - eventStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          
          if (calculatedDays !== 3 && eventStart === originalStart) {
            console.warn(`⚠️ Yellow event span is ${calculatedDays} days, expected 3 days for item: ${item.name}`);
          }
          
          // Verify: Always create yellow event for expiring_soon items
          const yellowEvent = {
            title: item.name,
            start: eventStart,
            end: eventEnd, // End at end of day before expiration
            resource: {
              itemId: item.id,
              status: 'expiring_soon',
              rowIndex: rowIndex,
            },
          } as CalendarEvent;
          allEvents.push(yellowEvent);
          
          // Debug: Verify yellow event was created with correct span
          console.log('✅ Created yellow expiring_soon event:', {
            item: item.name,
            expirationDate: expirationDate.toISOString().split('T')[0],
            start: yellowEvent.start ? yellowEvent.start.toISOString().split('T')[0] : 'undefined',
            end: yellowEvent.end ? yellowEvent.end.toISOString() : 'undefined',
            endDate: yellowEvent.end ? new Date(yellowEvent.end).toISOString().split('T')[0] : 'undefined',
            spanDays: calculatedDays,
            weekStart: weekStart.toISOString().split('T')[0],
            adjusted: eventStart < setToMidnight(threeDaysBefore),
            status: yellowEvent.resource.status,
            inCurrentWeek: yellowEvent.start && yellowEvent.end && 
              yellowEvent.start <= weekStart && 
              yellowEvent.end >= weekStart
          });
          
          // Red: Show on the expiration date itself (no title - adjacent to yellow span)
          allEvents.push({
            title: '', // Empty title since it's adjacent to yellow span
            start: setToMidnight(expirationDate),
            end: setToEndOfDay(expirationDate),
            resource: {
              itemId: item.id,
              status: 'expired', // Use expired status for red color on expiration day
              rowIndex: rowIndex,
              isAdjacentToYellow: true, // Flag to indicate this is adjacent to yellow span
            },
          } as CalendarEvent);
        } else {
          // Day/month view: Create individual events for each day
          for (let i = 3; i >= 1; i--) {
            const dayBefore = addDays(expirationDate, -i);
            allEvents.push({
              title: item.name,
              start: setToMidnight(dayBefore),
              end: setToEndOfDay(dayBefore),
              resource: {
                itemId: item.id,
                status: 'expiring_soon',
                rowIndex: rowIndex,
              },
            } as CalendarEvent);
          }
          
          // Red: Show on the expiration date itself
          allEvents.push({
            title: item.name,
            start: setToMidnight(expirationDate),
            end: setToEndOfDay(expirationDate),
            resource: {
              itemId: item.id,
              status: 'expired', // Use expired status for red color on expiration day
              rowIndex: rowIndex,
            },
          } as CalendarEvent);
        }
        rowIndex++;
      } else {
        // Green (fresh): Single day on expiration date
        allEvents.push({
          title: item.name,
          start: setToMidnight(expirationDate),
          end: setToEndOfDay(expirationDate),
          resource: {
            itemId: item.id,
            status: 'fresh',
            rowIndex: rowIndex,
          },
        } as CalendarEvent);
        rowIndex++;
      }
    });

    // Debug: Log all events by status
    const expiringSoonEvents = allEvents.filter(e => e.resource.status === 'expiring_soon');
    const expiredEvents = allEvents.filter(e => e.resource.status === 'expired');
    
    // Get current week range for visibility check
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
    const weekEnd = addDays(weekStart, 6);
    
    // Check which yellow events intersect with current week
    const visibleYellowEvents = expiringSoonEvents.filter(e => {
      if (!e.start || !e.end) return false;
      const eventStart = new Date(e.start);
      const eventEnd = new Date(e.end);
      // Event is visible if it intersects with the week
      return eventEnd >= weekStart && eventStart <= weekEnd;
    });
    
    console.log('📅 Calendar events summary:', {
      total: allEvents.length,
      expiring_soon: expiringSoonEvents.length,
      expired: expiredEvents.length,
      visible_yellow: visibleYellowEvents.length,
      currentView: currentView,
      currentDate: currentDate.toISOString().split('T')[0],
      weekRange: `${weekStart.toISOString().split('T')[0]} to ${weekEnd.toISOString().split('T')[0]}`,
      expiring_soon_details: expiringSoonEvents.map(e => ({
        title: e.title,
        start: e.start?.toISOString().split('T')[0],
        end: e.end ? new Date(e.end).toISOString().split('T')[0] : 'undefined',
        endTime: e.end ? new Date(e.end).toISOString() : 'undefined',
        intersectsWeek: e.start && e.end && new Date(e.end) >= weekStart && new Date(e.start) <= weekEnd
      }))
    });
    
    // Verify: Ensure we have yellow events for all expiring_soon items
    const expiringSoonItems = sortedItems.filter(item => {
      const expDate = new Date(item.expirationDate);
      return getFoodItemStatus(expDate, 7) === 'expiring_soon';
    });
    if (expiringSoonItems.length > 0 && expiringSoonEvents.length === 0 && currentView === 'week') {
      console.error('❌ ERROR: No yellow events created for expiring_soon items!', {
        expiringSoonItemsCount: expiringSoonItems.length,
        expiringSoonItems: expiringSoonItems.map(i => i.name)
      });
    }

    return allEvents;
  }, [foodItems, currentView]);

  // Custom event style function
  const eventStyleGetter = (event: CalendarEvent) => {
    // Debug: Log when eventStyleGetter is called for yellow events
    if (event.resource.status === 'expiring_soon') {
      console.log('🎨 eventStyleGetter called for yellow event:', {
        title: event.title,
        start: event.start?.toISOString(),
        end: event.end?.toISOString(),
        status: event.resource.status
      });
    }
    
    const color = getStatusColor(event.resource.status);
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
    // Start from top (0px) and stack downward based on expiration proximity
    // Items closest to expiring (rowIndex 0) appear at the top
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
      (baseStyle as any)['--rbc-event-top'] = `${topPosition}px`;
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

  // Handle event click - navigate to item detail
  const handleSelectEvent = (event: CalendarEvent) => {
    navigate(`/item/${event.resource.itemId}`);
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
    const hasExpiring = statuses.has('expiring_soon');
    const hasExpired = statuses.has('expired');

    // Store status info in data attributes for CSS
    const statusClasses = [];
    if (hasFresh) statusClasses.push('has-fresh');
    if (hasExpiring) statusClasses.push('has-expiring');
    if (hasExpired) statusClasses.push('has-expired');

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

    // Filter out expired items (items past their expiration date)
    // Only show items that haven't expired yet - expired items fall off the calendar
    const today = startOfDay(new Date());
    const nonExpiredItems = foodItems.filter(item => {
      const expirationDate = new Date(item.expirationDate);
      const expirationDay = startOfDay(expirationDate);
      // Only show items that haven't expired yet (expiration date is today or in the future)
      const isNotExpired = expirationDay >= today;
      if (!isNotExpired) {
        console.log(`🔴 Filtered out expired item: ${item.name}, expiration: ${expirationDay.toISOString().split('T')[0]}, today: ${today.toISOString().split('T')[0]}`);
      }
      return isNotExpired;
    });

    // Debug: Log all items and their statuses
    console.log('📋 All food items:', foodItems.map(item => ({
      name: item.name,
      expirationDate: item.expirationDate,
      status: getFoodItemStatus(new Date(item.expirationDate), 7)
    })));
    console.log('✅ Non-expired items:', nonExpiredItems.map(item => ({
      name: item.name,
      expirationDate: item.expirationDate,
      status: getFoodItemStatus(new Date(item.expirationDate), 7)
    })));

    // Sort items by expiration proximity (soonest first)
    const sortedItems = [...nonExpiredItems].sort((a, b) => {
      const dateA = new Date(a.expirationDate);
      const dateB = new Date(b.expirationDate);
      const daysUntilA = Math.ceil((dateA.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const daysUntilB = Math.ceil((dateB.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return daysUntilA - daysUntilB;
    });
    
    console.log('📊 Sorted items for rendering:', sortedItems.map(item => ({
      name: item.name,
      expirationDate: item.expirationDate,
      status: getFoodItemStatus(new Date(item.expirationDate), 7),
      daysUntil: Math.ceil((new Date(item.expirationDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    })));

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
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Day headers */}
        <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb' }}>
          {weekDays.map((day, index) => (
            <div
              key={index}
              style={{
                flex: 1,
                padding: '0.5rem',
                textAlign: 'center',
                fontWeight: '600',
                borderRight: index < 6 ? '1px solid #e5e7eb' : 'none',
                backgroundColor: isSameDay(day, today) ? '#f3f4f6' : 'transparent'
              }}
            >
              <div style={{ fontSize: '0.875rem' }}>{format(day, 'EEE')}</div>
              <div style={{ fontSize: '1.25rem' }}>{format(day, 'd')}</div>
            </div>
          ))}
        </div>

        {/* Items rows */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {sortedItems.map((item) => {
            const expirationDate = new Date(item.expirationDate);
            const status = getFoodItemStatus(expirationDate, 7);
            
            // Calculate 4-day span: 3 days before expiration (yellow) + expiration day (red)
            const threeDaysBefore = addDays(expirationDate, -3);
            
            // Get column indices for the 4-day span (3 yellow days + 1 red day)
            const yellowStartCol = getColumnIndex(threeDaysBefore);
            const redCol = getColumnIndex(expirationDate);
            
            // Debug: Log item rendering info
            console.log(`🔍 Item: ${item.name}`, {
              status,
              expirationDate: expirationDate.toISOString().split('T')[0],
              threeDaysBefore: threeDaysBefore.toISOString().split('T')[0],
              yellowStartCol,
              redCol,
              weekStart: weekStart.toISOString().split('T')[0],
              weekEnd: weekDays[6].toISOString().split('T')[0],
              spanIntersectsWeek: (yellowStartCol !== null || redCol !== null)
            });

            // Only render expiring_soon items (expired items are filtered out above)
            if (status !== 'expiring_soon') {
              // For fresh items, show green on expiration day only (if expiration is in current week)
              if (status === 'fresh' && redCol !== null) {
                console.log(`✅ Rendering fresh item: ${item.name} on expiration day (col ${redCol})`);
                return (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      height: `${rowHeight}px`,
                      borderBottom: '1px solid #e5e7eb',
                      alignItems: 'center'
                    }}
                  >
                    {weekDays.map((_, colIndex) => {
                      if (colIndex === redCol) {
                        return (
                          <div
                            key={colIndex}
                            style={{
                              flex: 1,
                              height: '100%',
                              backgroundColor: '#22c55e',
                              color: '#ffffff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRight: colIndex < 6 ? '1px solid #e5e7eb' : 'none',
                              fontWeight: '500',
                              padding: '0 0.5rem'
                            }}
                          >
                            {item.name}
                          </div>
                        );
                      }
                      return (
                        <div
                          key={colIndex}
                          style={{
                            flex: 1,
                            borderRight: colIndex < 6 ? '1px solid #e5e7eb' : 'none'
                          }}
                        />
                      );
                    })}
                  </div>
                );
              }
              // Fresh item but expiration date not in current week - don't render
              console.log(`⚠️ Fresh item ${item.name} expiration date not in current week - skipping`);
              return null;
            }

            // Render expiring_soon items with single 4-day span (3 yellow + 1 red)
            // Create a single continuous block spanning from yellowStartCol to redCol
            // Use the actual dates to determine span, even if columns are null (span might extend beyond week)
            const spanStartCol = yellowStartCol;
            const spanEndCol = redCol;
            
            // Check if span intersects with week - if expiration date or any part of yellow span is in week
            const expirationInWeek = redCol !== null;
            const yellowSpanInWeek = yellowStartCol !== null;
            const spanIntersectsWeek = expirationInWeek || yellowSpanInWeek;
            
            // Only render if the span intersects with the current week view
            if (!spanIntersectsWeek) {
              console.log(`⚠️ Item ${item.name} span doesn't intersect current week - skipping`, {
                threeDaysBefore: threeDaysBefore.toISOString().split('T')[0],
                expirationDate: expirationDate.toISOString().split('T')[0],
                weekStart: weekStart.toISOString().split('T')[0],
                weekEnd: weekDays[6].toISOString().split('T')[0]
              });
              return null;
            }
            
            // Calculate middle column for centering item name
            // If span is fully in week, use middle of span. Otherwise use available column
            const middleCol = spanStartCol !== null && spanEndCol !== null 
              ? Math.floor((spanStartCol + spanEndCol) / 2)
              : (spanStartCol !== null ? spanStartCol : (spanEndCol !== null ? spanEndCol : 0));
            
            // Determine actual start and end columns to render (clip to week bounds if needed)
            const renderStartCol = spanStartCol !== null ? spanStartCol : 0;
            const renderEndCol = spanEndCol !== null ? spanEndCol : 6;

            console.log(`✅ Rendering item: ${item.name}`, {
              spanStartCol,
              spanEndCol,
              middleCol,
              status
            });

            return (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  height: `${rowHeight}px`,
                  borderBottom: '1px solid #e5e7eb',
                  alignItems: 'center',
                  position: 'relative'
                }}
              >
                {weekDays.map((_, colIndex) => {
                  // Check if this column is part of the span
                  // Span goes from yellowStartCol (or 0 if null) to redCol (or 6 if null)
                  const isInSpan = colIndex >= renderStartCol && colIndex <= renderEndCol;
                  const isRedDay = colIndex === redCol;

                  if (isInSpan) {
                    // Single continuous 4-day block (3 yellow days + 1 red day)
                    return (
                      <div
                        key={colIndex}
                        style={{
                          flex: 1,
                          height: '100%',
                          backgroundColor: isRedDay ? '#ef4444' : '#f59e0b',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRight: colIndex < 6 ? '1px solid rgba(255, 255, 255, 0.3)' : 'none',
                          fontWeight: '500',
                          padding: '0 0.5rem',
                          position: 'relative'
                        }}
                      >
                        {/* Show item name in both yellow and red sections */}
                        {item.name}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={colIndex}
                      style={{
                        flex: 1,
                        borderRight: colIndex < 6 ? '1px solid #e5e7eb' : 'none'
                      }}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Custom event component
  const EventComponent = ({ event }: { event: CalendarEvent }) => {
    if (currentView === 'month') {
      // In month view, show as a small colored dot
      const color = getStatusColor(event.resource.status);
      return (
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: color,
            margin: '0 auto',
            cursor: 'pointer',
          }}
          title={event.title as string}
        />
      );
    }
    
    // In week/day view, show full event with title
    // For day view, also show expiration date
    if (currentView === 'day') {
      // Find the original item to get expiration date
      const item = foodItems.find((i) => i.id === event.resource.itemId);
      const expirationDate = item ? new Date(item.expirationDate) : null;
      const formattedDate = expirationDate ? format(expirationDate, 'MMM d, yyyy') : '';
      
      return (
        <div style={{ padding: '2px 4px', fontSize: '0.875rem' }}>
          <div style={{ fontWeight: '500' }}>{event.title}</div>
          {formattedDate && (
            <div style={{ fontSize: '0.75rem', opacity: 0.9, marginTop: '2px' }}>
              Expires: {formattedDate}
            </div>
          )}
        </div>
      );
    }
    
    // Week view: show title only if not empty (red expiration day adjacent to yellow has empty title)
    if (event.resource.isAdjacentToYellow) {
      return <div style={{ padding: '2px 4px' }}></div>; // Empty div for red expiration day
    }
    // Show title for all other events (including yellow spanning events)
    return <div style={{ padding: '2px 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.title}</div>;
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
        padding: 0 !important;
        margin: 0 auto !important;
        height: auto !important;
        min-height: 0 !important;
        display: flex;
        justify-content: center;
        align-items: center;
      }
      .rbc-month-view .rbc-event-content {
        padding: 0 !important;
      }
      .rbc-month-view .rbc-day-slot .rbc-events-container {
        margin: 0 !important;
        display: flex;
        flex-direction: row;
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
      /* Ensure all events with expiring_soon status are visible */
      .rbc-time-view .rbc-event.calendar-event-expiring_soon {
        display: flex !important;
        visibility: visible !important;
        opacity: 1 !important;
        background-color: #f59e0b !important;
        border-color: #f59e0b !important;
      }
      /* Debug: Make sure yellow events are visible - target by background color */
      .rbc-time-view .rbc-event[style*="rgb(245, 158, 11)"],
      .rbc-time-view .rbc-event[style*="#f59e0b"],
      .rbc-time-view .rbc-event[style*="background-color: rgb(245, 158, 11)"] {
        display: flex !important;
        visibility: visible !important;
        opacity: 1 !important;
      }
      /* Ensure yellow events are not hidden by any parent containers */
      .rbc-time-view .rbc-day-slot .rbc-events-container .rbc-event.calendar-event-expiring_soon {
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
      {/* Banner Header */}
      <div style={{
        backgroundColor: '#002B4D',
        color: '#ffffff',
        padding: '1rem',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700', color: '#ffffff' }}>
            TossItTime
          </h1>
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
              width: '44px', // Touch target size for mobile
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
            <span style={{ width: '24px', height: '2px', backgroundColor: '#ffffff', display: 'block', borderRadius: '1px' }} />
            <span style={{ width: '24px', height: '2px', backgroundColor: '#ffffff', display: 'block', borderRadius: '1px' }} />
            <span style={{ width: '24px', height: '2px', backgroundColor: '#ffffff', display: 'block', borderRadius: '1px' }} />
          </button>
        </div>
      </div>

      {/* Shop, List and Calendar Buttons */}
      <div style={{ padding: '1rem', maxWidth: '1400px', margin: '0 auto', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <button
          onClick={() => navigate('/shop')}
          style={{
            padding: '0.75rem 2rem',
            backgroundColor: '#f3f4f6',
            color: '#1f2937',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: '500',
            cursor: 'pointer',
            minHeight: '44px',
            minWidth: '120px'
          }}
        >
          Lists
        </button>
        <button
          onClick={() => navigate('/')}
          style={{
            padding: '0.75rem 2rem',
            backgroundColor: '#f3f4f6',
            color: '#1f2937',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: '500',
            cursor: 'pointer',
            minHeight: '44px',
            minWidth: '120px'
          }}
        >
          Items
        </button>
        <button
          onClick={() => {
            // Already on Calendar, just scroll to top or do nothing
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          style={{
            padding: '0.75rem 2rem',
            backgroundColor: '#002B4D',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: '500',
            cursor: 'pointer',
            minHeight: '44px',
            minWidth: '120px'
          }}
        >
          Calendar
        </button>
      </div>

      {/* Main Content */}
      <div 
        style={{ padding: '1rem', maxWidth: '1400px', margin: '0 auto', paddingTop: '1.5rem', paddingBottom: '2rem' }}
        onTouchStart={(e) => {
          const touch = e.touches[0];
          setTouchStart({ x: touch.clientX, y: touch.clientY });
          setTouchEnd(null);
        }}
        onTouchMove={(e) => {
          const touch = e.touches[0];
          setTouchEnd({ x: touch.clientX, y: touch.clientY });
        }}
        onTouchEnd={() => {
          if (!touchStart || !touchEnd) return;
          
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
              justifyContent: 'center'
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
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: currentView === view ? '#002B4D' : '#f3f4f6',
                color: currentView === view ? '#ffffff' : '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                textTransform: 'capitalize',
                minHeight: '44px'
              }}
            >
              {view}
            </button>
          ))}
          
          {/* Right chevrons - navigate forward */}
          <button
            onClick={navigateForward}
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
              justifyContent: 'center'
            }}
            aria-label="Navigate forward"
          >
            »
          </button>
        </div>
      <div style={{ height: '600px', backgroundColor: '#ffffff', borderRadius: '8px', padding: '1rem' }}>
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
              backgroundColor: '#22c55e',
            }}
          />
          <span style={{ fontSize: '0.875rem' }}>Fresh</span>
        </div>
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
