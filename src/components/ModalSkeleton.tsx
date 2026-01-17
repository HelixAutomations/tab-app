// src/components/ModalSkeleton.tsx
// Skeleton loading state for modal content

import React from 'react';
import { useTheme } from '../app/functionality/ThemeContext';
import '../app/styles/animations.css';

interface ModalSkeletonProps {
  variant?:
    | 'annual-leave'
    | 'annual-leave-request'
    | 'annual-leave-approve'
    | 'annual-leave-book'
    | 'attendance'
    | 'task'
    | 'generic';
}

const SkeletonBlock: React.FC<{ 
  width?: string | number; 
  height?: string | number; 
  isDark: boolean;
  borderRadius?: number;
  style?: React.CSSProperties;
}> = ({ width = '100%', height = 20, isDark, borderRadius = 4, style }) => (
  <div
    className="skeleton-shimmer"
    style={{
      width,
      height,
      borderRadius,
      background: isDark ? 'rgba(54, 144, 206, 0.08)' : 'rgba(148, 163, 184, 0.15)',
      ...style
    }}
  />
);

export const ModalSkeleton: React.FC<ModalSkeletonProps> = ({ variant = 'generic' }) => {
  const { isDarkMode } = useTheme();
  
  const textMuted = isDarkMode ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.6)';

  const annualLeaveRequestSkeleton = (
    <div style={{ padding: '8px 0' }}>
      {/* Admin bar skeleton */}
      <div style={{
        display: 'flex',
        gap: 8,
        marginBottom: 16,
        padding: '10px 12px',
        background: isDarkMode ? 'rgba(255, 183, 77, 0.06)' : 'rgba(255, 152, 0, 0.06)',
        borderRadius: 4
      }}>
        <SkeletonBlock width={70} height={24} isDark={isDarkMode} borderRadius={3} />
        <SkeletonBlock width={60} height={24} isDark={isDarkMode} borderRadius={3} />
        <SkeletonBlock width={55} height={24} isDark={isDarkMode} borderRadius={3} />
        <SkeletonBlock width={65} height={24} isDark={isDarkMode} borderRadius={3} />
      </div>

      {/* 2-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Left: Calendar skeleton */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <SkeletonBlock width={24} height={24} isDark={isDarkMode} />
            <SkeletonBlock width={120} height={20} isDark={isDarkMode} />
            <SkeletonBlock width={24} height={24} isDark={isDarkMode} />
          </div>
          {/* Calendar grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {/* Weekday headers */}
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((_, i) => (
              <SkeletonBlock key={`h-${i}`} width="100%" height={20} isDark={isDarkMode} borderRadius={2} />
            ))}
            {/* Calendar days */}
            {Array.from({ length: 35 }).map((_, i) => (
              <SkeletonBlock key={i} width="100%" height={32} isDark={isDarkMode} borderRadius={2} />
            ))}
          </div>
        </div>

        {/* Right: Stats skeleton */}
        <div>
          {/* Legend */}
          <div style={{
            padding: 10,
            marginBottom: 12,
            background: isDarkMode ? 'rgba(135, 243, 243, 0.08)' : 'rgba(54, 144, 206, 0.06)',
            borderRadius: 0
          }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              {[80, 70, 60, 65, 70].map((w, i) => (
                <SkeletonBlock key={i} width={w} height={14} isDark={isDarkMode} borderRadius={2} />
              ))}
            </div>
            <SkeletonBlock width="90%" height={12} isDark={isDarkMode} />
          </div>

          {/* Stats card */}
          <div style={{
            padding: 16,
            background: isDarkMode ? 'rgba(6, 23, 51, 0.4)' : 'rgba(255, 255, 255, 0.95)',
            borderRadius: 0,
            marginBottom: 16
          }}>
            <SkeletonBlock width={100} height={12} isDark={isDarkMode} style={{ marginBottom: 8 }} />
            <SkeletonBlock width={60} height={32} isDark={isDarkMode} style={{ marginBottom: 16 }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <SkeletonBlock width={120} height={14} isDark={isDarkMode} />
                  <SkeletonBlock width={40} height={14} isDark={isDarkMode} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.1)', margin: '20px 0 16px' }} />

      {/* Leave history skeleton */}
      <div>
        <SkeletonBlock width={150} height={12} isDark={isDarkMode} style={{ marginBottom: 10 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 12px',
              background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              borderRadius: 4
            }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <SkeletonBlock width={80} height={16} isDark={isDarkMode} />
                <SkeletonBlock width={60} height={16} isDark={isDarkMode} />
              </div>
              <SkeletonBlock width={70} height={20} isDark={isDarkMode} borderRadius={10} />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom actions */}
      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <SkeletonBlock width={100} height={36} isDark={isDarkMode} borderRadius={4} />
        <SkeletonBlock width={140} height={36} isDark={isDarkMode} borderRadius={4} />
      </div>

      {/* Loading indicator text */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 16,
        color: textMuted,
        fontSize: 12
      }}>
        <span>Loading leave request form...</span>
      </div>
    </div>
  );

  const annualLeaveApproveSkeleton = (
    <div style={{ padding: '8px 0' }}>
      {/* Header bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
        marginBottom: 14
      }}>
        <SkeletonBlock width={170} height={18} isDark={isDarkMode} />
        <SkeletonBlock width={120} height={28} isDark={isDarkMode} borderRadius={14} />
      </div>

      {/* Search / filter row */}
      <div style={{
        display: 'flex',
        gap: 10,
        marginBottom: 16
      }}>
        <SkeletonBlock width="100%" height={34} isDark={isDarkMode} borderRadius={6} />
        <SkeletonBlock width={90} height={34} isDark={isDarkMode} borderRadius={6} />
      </div>

      {/* Approval cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{
            padding: '14px 14px',
            borderRadius: 8,
            background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(6,23,51,0.08)'}`
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <SkeletonBlock width={34} height={34} isDark={isDarkMode} borderRadius={17} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <SkeletonBlock width={120} height={12} isDark={isDarkMode} />
                  <SkeletonBlock width={160} height={10} isDark={isDarkMode} />
                </div>
              </div>
              <SkeletonBlock width={86} height={20} isDark={isDarkMode} borderRadius={10} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <SkeletonBlock width="85%" height={12} isDark={isDarkMode} />
              <SkeletonBlock width="70%" height={12} isDark={isDarkMode} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
              <SkeletonBlock width={110} height={34} isDark={isDarkMode} borderRadius={6} />
              <SkeletonBlock width={110} height={34} isDark={isDarkMode} borderRadius={6} />
            </div>
          </div>
        ))}
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 16,
        color: textMuted,
        fontSize: 12
      }}>
        <span>Loading approvals...</span>
      </div>
    </div>
  );

  const annualLeaveBookSkeleton = (
    <div style={{ padding: '8px 0' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
        marginBottom: 14
      }}>
        <SkeletonBlock width={190} height={18} isDark={isDarkMode} />
        <SkeletonBlock width={90} height={28} isDark={isDarkMode} borderRadius={14} />
      </div>

      {/* Booking cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{
            borderRadius: 8,
            overflow: 'hidden',
            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(6,23,51,0.08)'}`,
            background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'
          }}>
            <div style={{
              padding: '14px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: isDarkMode ? 'rgba(7, 16, 32, 0.6)' : 'rgba(248, 250, 252, 0.7)'
            }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <SkeletonBlock width={34} height={34} isDark={isDarkMode} borderRadius={17} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <SkeletonBlock width={110} height={12} isDark={isDarkMode} />
                  <SkeletonBlock width={150} height={10} isDark={isDarkMode} />
                </div>
              </div>
              <SkeletonBlock width={92} height={20} isDark={isDarkMode} borderRadius={10} />
            </div>
            <div style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <SkeletonBlock width={120} height={18} isDark={isDarkMode} borderRadius={12} />
                <SkeletonBlock width={90} height={18} isDark={isDarkMode} borderRadius={12} />
              </div>
              <SkeletonBlock width="75%" height={12} isDark={isDarkMode} style={{ marginBottom: 8 }} />
              <SkeletonBlock width="55%" height={12} isDark={isDarkMode} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                <SkeletonBlock width={120} height={34} isDark={isDarkMode} borderRadius={6} />
                <SkeletonBlock width={110} height={34} isDark={isDarkMode} borderRadius={6} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 16,
        color: textMuted,
        fontSize: 12
      }}>
        <span>Loading bookings...</span>
      </div>
    </div>
  );

  if (variant === 'annual-leave' || variant === 'annual-leave-request') {
    return (
      annualLeaveRequestSkeleton
    );
  }

  if (variant === 'annual-leave-approve') {
    return annualLeaveApproveSkeleton;
  }

  if (variant === 'annual-leave-book') {
    return annualLeaveBookSkeleton;
  }

  if (variant === 'attendance') {
    return (
      <div style={{ padding: '8px 0' }}>
        {/* Status options - In Office, WFH, Out */}
        <div style={{
          padding: 12,
          marginBottom: 16,
          background: isDarkMode ? 'rgba(6, 23, 51, 0.4)' : 'rgba(255, 255, 255, 0.95)',
          borderRadius: 4,
          border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.06)'}`
        }}>
          <SkeletonBlock width={120} height={12} isDark={isDarkMode} style={{ marginBottom: 10 }} />
          <div style={{ display: 'flex', gap: 10 }}>
            {/* In Office */}
            <div style={{
              flex: 1,
              padding: '10px 12px',
              background: isDarkMode ? 'rgba(115, 171, 96, 0.1)' : 'rgba(115, 171, 96, 0.08)',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <SkeletonBlock width={24} height={24} isDark={isDarkMode} borderRadius={4} />
              <SkeletonBlock width={60} height={14} isDark={isDarkMode} />
            </div>
            {/* WFH */}
            <div style={{
              flex: 1,
              padding: '10px 12px',
              background: isDarkMode ? 'rgba(54, 144, 206, 0.1)' : 'rgba(54, 144, 206, 0.08)',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <SkeletonBlock width={24} height={24} isDark={isDarkMode} borderRadius={4} />
              <SkeletonBlock width={40} height={14} isDark={isDarkMode} />
            </div>
            {/* Out */}
            <div style={{
              flex: 1,
              padding: '10px 12px',
              background: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <SkeletonBlock width={24} height={24} isDark={isDarkMode} borderRadius={4} />
              <SkeletonBlock width={30} height={14} isDark={isDarkMode} />
            </div>
          </div>
        </div>

        {/* Week view skeleton - Mon to Fri only */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 8,
          marginBottom: 16
        }}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day, i) => (
            <div key={i} style={{
              padding: 10,
              background: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              borderRadius: 4,
              border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`
            }}>
              <SkeletonBlock width={32} height={10} isDark={isDarkMode} style={{ marginBottom: 6 }} />
              <SkeletonBlock width="100%" height={36} isDark={isDarkMode} borderRadius={4} />
            </div>
          ))}
        </div>

        {/* Notes section */}
        <SkeletonBlock width={50} height={10} isDark={isDarkMode} style={{ marginBottom: 6 }} />
        <SkeletonBlock width="100%" height={60} isDark={isDarkMode} style={{ marginBottom: 16 }} />

        {/* Submit button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <SkeletonBlock width={80} height={32} isDark={isDarkMode} borderRadius={4} />
          <SkeletonBlock width={120} height={32} isDark={isDarkMode} borderRadius={4} />
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          marginTop: 16,
          color: textMuted,
          fontSize: 12
        }}>
          <span>Loading attendance data...</span>
        </div>
      </div>
    );
  }

  if (variant === 'task') {
    return (
      <div style={{ padding: '8px 0' }}>
        {/* Form fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Title field */}
          <div>
            <SkeletonBlock width={60} height={12} isDark={isDarkMode} style={{ marginBottom: 6 }} />
            <SkeletonBlock width="100%" height={36} isDark={isDarkMode} />
          </div>
          
          {/* Description field */}
          <div>
            <SkeletonBlock width={80} height={12} isDark={isDarkMode} style={{ marginBottom: 6 }} />
            <SkeletonBlock width="100%" height={100} isDark={isDarkMode} />
          </div>

          {/* Date and priority row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <SkeletonBlock width={60} height={12} isDark={isDarkMode} style={{ marginBottom: 6 }} />
              <SkeletonBlock width="100%" height={36} isDark={isDarkMode} />
            </div>
            <div>
              <SkeletonBlock width={50} height={12} isDark={isDarkMode} style={{ marginBottom: 6 }} />
              <SkeletonBlock width="100%" height={36} isDark={isDarkMode} />
            </div>
          </div>

          {/* Assignee */}
          <div>
            <SkeletonBlock width={70} height={12} isDark={isDarkMode} style={{ marginBottom: 6 }} />
            <SkeletonBlock width="100%" height={36} isDark={isDarkMode} />
          </div>
        </div>

        {/* Submit button */}
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <SkeletonBlock width={80} height={36} isDark={isDarkMode} borderRadius={4} />
          <SkeletonBlock width={100} height={36} isDark={isDarkMode} borderRadius={4} />
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          marginTop: 16,
          color: textMuted,
          fontSize: 12
        }}>
          <span>Loading form...</span>
        </div>
      </div>
    );
  }

  // Generic skeleton
  return (
    <div style={{ padding: '16px 0' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SkeletonBlock width="70%" height={20} isDark={isDarkMode} />
        <SkeletonBlock width="100%" height={80} isDark={isDarkMode} />
        <SkeletonBlock width="85%" height={16} isDark={isDarkMode} />
        <SkeletonBlock width="60%" height={16} isDark={isDarkMode} />
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <SkeletonBlock width={100} height={36} isDark={isDarkMode} borderRadius={4} />
          <SkeletonBlock width={100} height={36} isDark={isDarkMode} borderRadius={4} />
        </div>
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 24,
        color: textMuted,
        fontSize: 12
      }}>
        <span>Loading...</span>
      </div>
    </div>
  );
};

export default ModalSkeleton;
