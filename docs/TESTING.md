# Cross-Browser Testing Guide

This document outlines the manual testing procedures for StellarGive across major browsers to ensure consistent user experience and performance.

## Browser Versions Tested

- Chrome (Latest stable)
- Firefox (Latest stable)
- Safari (Latest stable)

## Test Environment Setup

- Clear browser cache and cookies before each test session
- Disable browser extensions that may interfere with functionality
- Test on both desktop and mobile viewports where applicable

## Core Flows - Functional Testing

### 1. Wallet Connection Flow

#### Test Case: User connects wallet via Freighter/WalletConnect

**Steps:**
1. Navigate to the application home page
2. Click "Connect Wallet" button
3. Select wallet provider (Freighter/WalletConnect)
4. Complete wallet authentication flow
5. Verify wallet address displayed in header
6. Verify user is redirected to dashboard

**Expected Results:**
- Connection succeeds without errors
- Wallet address displays correctly
- User session persists on page reload
- Logout functionality works properly

**Browser Results:**

| Browser | Pass | Issues |
|---------|------|--------|
| Chrome  |      |        |
| Firefox |      |        |
| Safari  |      |        |

---

### 2. Create Campaign Flow

#### Test Case: User creates a new fundraising campaign

**Steps:**
1. Connect wallet and navigate to Create Campaign page
2. Fill in campaign details:
   - Title (max 50 characters)
   - Description (via metadata URI)
   - Category selection
   - Target amount
   - Deadline
   - Beneficiary selection
3. Submit form
4. Verify transaction signing
5. Confirm campaign appears in campaign list

**Expected Results:**
- Form validation works for all fields
- Campaign created successfully
- New campaign visible in listings
- Campaign details accurate

**Browser Results:**

| Browser | Pass | Issues |
|---------|------|--------|
| Chrome  |      |        |
| Firefox |      |        |
| Safari  |      |        |

---

### 3. Donate to Campaign Flow

#### Test Case: User donates to an active campaign

**Steps:**
1. Navigate to campaign detail page
2. Enter donation amount
3. Click "Donate" button
4. Approve token transfer in wallet
5. Verify transaction confirmation
6. Check updated campaign progress

**Expected Results:**
- Donation amount input accepts valid values
- Token approval flow works smoothly
- Transaction succeeds
- Campaign progress bar updates
- Donation reflected in campaign total

**Browser Results:**

| Browser | Pass | Issues |
|---------|------|--------|
| Chrome  |      |        |
| Firefox |      |        |
| Safari  |      |        |

---

### 4. View User Profile

#### Test Case: User views their profile and donation history

**Steps:**
1. Connect wallet and navigate to Profile
2. View personal information
3. View campaign creation history
4. View donation history
5. Check profile editing capabilities
6. Verify statistics display correctly

**Expected Results:**
- Profile loads without errors
- All personal data displays correctly
- Campaign history accurate
- Donation history complete
- Statistics calculate correctly

**Browser Results:**

| Browser | Pass | Issues |
|---------|------|--------|
| Chrome  |      |        |
| Firefox |      |        |
| Safari  |      |        |

---

### 5. Claim Campaign Funds

#### Test Case: Campaign beneficiary claims funds after deadline

**Steps:**
1. Navigate to completed campaign (deadline passed, target reached)
2. Click "Claim Funds" button (if user is beneficiary)
3. Approve transaction in wallet
4. Verify funds transferred to beneficiary
5. Verify campaign status changes to "Claimed"

**Expected Results:**
- Claim button only visible to beneficiary
- Transaction succeeds
- Funds transferred accurately
- Campaign status updates
- Success notification displayed

**Browser Results:**

| Browser | Pass | Issues |
|---------|------|--------|
| Chrome  |      |        |
| Firefox |      |        |
| Safari  |      |        |

---

## Layout Consistency - Visual Testing

### 1. Grid Alignment and Responsive Design

**Desktop (1920x1080):**
- Campaign cards align in consistent grid (2-3 columns)
- Navigation bar positioned correctly
- Content margins and padding uniform
- No horizontal scrolling

**Tablet (768x1024):**
- Grid adapts to 1-2 columns
- Touch targets are appropriately sized (minimum 44px)
- Navigation menu adapts (hamburger menu for smaller screens)
- Content readable without zooming

**Mobile (375x667):**
- Single column layout
- Full-width content area
- Mobile navigation functional
- No content cutoff

**Browser Results:**

| Browser | Desktop | Tablet | Mobile | Issues |
|---------|---------|--------|--------|--------|
| Chrome  |         |        |        |        |
| Firefox |         |        |        |        |
| Safari  |         |        |        |        |

---

### 2. Button Sizes and States

**Button Specifications:**
- Primary buttons: minimum 44x44px touch target
- Secondary buttons: minimum 40x40px
- Buttons have distinct hover states
- Buttons have active/pressed states
- Disabled state visually distinguishable

**Test Cases:**
1. Verify all buttons meet size requirements
2. Verify hover state changes (color, shadow, or opacity)
3. Verify active state during transaction
4. Verify disabled state for unavailable actions
5. Verify focus states for keyboard navigation

**Browser Results:**

| Browser | Meets Specs | Hover States | Active States | Focus States | Issues |
|---------|------------|--------------|---------------|--------------|--------|
| Chrome  |            |              |               |              |        |
| Firefox |            |              |               |              |        |
| Safari  |            |              |               |              |        |

---

### 3. Font Rendering and Typography

**Typography Standards:**
- Primary font: Readable at all sizes
- Font weights: Regular (400), Medium (500), Bold (700)
- Line spacing: Comfortable reading distance
- Letter spacing: Consistent and appropriate

**Test Cases:**
1. Verify heading font renders correctly at all sizes
2. Verify body text readability
3. Verify font weights display correctly
4. Verify line height appropriate for readability
5. Verify special characters display correctly
6. Check for font smoothing (anti-aliasing)

**Browser Results:**

| Browser | Headings | Body Text | Font Weights | Special Chars | Anti-alias | Issues |
|---------|----------|-----------|--------------|---------------|-----------|--------|
| Chrome  |          |           |              |               |           |        |
| Firefox |          |           |              |               |           |        |
| Safari  |          |           |              |               |           |        |

---

## Animation Performance

### 1. Confetti Animation (Celebration)

**Trigger:** Campaign reaches target or donation successful

**Performance Checks:**
- Animation starts immediately upon trigger
- Animation runs at 60 FPS
- No jank or stuttering observed
- Animation completes within 3-4 seconds
- Animation does not impact page responsiveness

**Browser Results:**

| Browser | FPS | Smooth | No Jank | Performance Impact | Issues |
|---------|-----|--------|---------|-------------------|--------|
| Chrome  |     |        |         |                   |        |
| Firefox |     |        |         |                   |        |
| Safari  |     |        |         |                   |        |

---

### 2. Progress Bar Animation

**Trigger:** Campaign progress updates

**Performance Checks:**
- Progress bar animates smoothly
- Animation duration consistent (0.5-1 second)
- Number counter increments smoothly
- Percentage text updates accurately
- No layout shift during animation

**Browser Results:**

| Browser | Smooth | Duration | Accurate | No Shift | Issues |
|---------|--------|----------|----------|----------|--------|
| Chrome  |        |          |          |          |        |
| Firefox |        |          |          |          |        |
| Safari  |        |          |          |          |        |

---

### 3. Page Transitions and Fades

**Transitions Tested:**
- Page load fade-in
- Modal open/close
- Sidebar slide
- Dropdown animations

**Performance Checks:**
- Transitions run at consistent speed
- Timing is appropriate (200-400ms for UI elements)
- Easing functions feel natural
- No lag during transitions
- Accessible (respects prefers-reduced-motion)

**Browser Results:**

| Browser | Smooth | Timing | Natural Feel | Accessible | Issues |
|---------|--------|--------|--------------|------------|--------|
| Chrome  |        |        |              |            |        |
| Firefox |        |        |              |            |        |
| Safari  |        |        |              |            |        |

---

## Browser-Specific Issues and Fixes

### Known Issues and Workarounds

#### Chrome
- Issue: [Describe if found]
- Workaround: [Solution if applicable]
- Fixed in version: [Version if applicable]

#### Firefox
- Issue: [Describe if found]
- Workaround: [Solution if applicable]
- Fixed in version: [Version if applicable]

#### Safari
- Issue: [Describe if found]
- Workaround: [Solution if applicable]
- Fixed in version: [Version if applicable]

---

## Testing Checklist

### Pre-Test Checklist
- [ ] Clear browser cache and cookies
- [ ] Disable browser extensions
- [ ] Ensure latest browser version installed
- [ ] Test on multiple network speeds (if possible)
- [ ] Document browser and OS versions
- [ ] Have wallet provider ready for testing

### Test Execution Checklist
- [ ] Wallet connection flow tested
- [ ] Campaign creation flow tested
- [ ] Donation flow tested
- [ ] Profile view tested
- [ ] Claim funds flow tested
- [ ] Layout consistency verified
- [ ] Button sizes verified
- [ ] Font rendering verified
- [ ] Confetti animation performance tested
- [ ] Progress bar animation tested
- [ ] Page transition animation tested
- [ ] Screenshots captured for reference
- [ ] Issues documented
- [ ] Accessibility tested (keyboard navigation, screen reader)

### Post-Test Checklist
- [ ] Create issues for failing tests
- [ ] Document workarounds for browser-specific issues
- [ ] Link issues to this testing session
- [ ] Update browser compatibility matrix
- [ ] Notify team of critical issues

---

## Browser Compatibility Matrix

| Feature | Chrome | Firefox | Safari | Note |
|---------|--------|---------|--------|------|
| Wallet Connection | ✓ | ✓ | ✓ | |
| Campaign Creation | ✓ | ✓ | ✓ | |
| Donation Flow | ✓ | ✓ | ✓ | |
| Profile View | ✓ | ✓ | ✓ | |
| Claim Funds | ✓ | ✓ | ✓ | |
| Confetti Animation | ✓ | ✓ | ✓ | |
| Progress Animation | ✓ | ✓ | ✓ | |
| Page Transitions | ✓ | ✓ | ✓ | |
| Responsive Design | ✓ | ✓ | ✓ | |
| Keyboard Navigation | ✓ | ✓ | ✓ | |
| Screen Reader Support | ✓ | ✓ | ✓ | |

---

## How to Report Issues

When testing reveals a browser-specific issue:

1. Document the exact steps to reproduce
2. Note browser version and OS
3. Capture screenshot or video
4. Check if issue is CSS, JavaScript, or runtime related
5. Create GitHub issue with label: `browser-compatibility`
6. Include test results table

Example issue template:
```
**Browser:** Chrome 120 on macOS 14
**Issue:** Confetti animation stutters when campaign reaches target
**Steps to reproduce:**
1. Create campaign with low target
2. Donate to reach target
3. Observe confetti animation
**Expected:** Smooth 60 FPS animation
**Actual:** Animation drops to 20 FPS, visible stuttering
**Screenshot:** [Attach]
```

---

## Resources

- [Chrome DevTools Performance Guide](https://developer.chrome.com/docs/devtools/performance/)
- [Firefox Developer Tools](https://developer.mozilla.org/en-US/docs/Tools)
- [Safari Web Inspector](https://developer.apple.com/safari/tools/)
- [Web Vitals](https://web.dev/vitals/)
- [WCAG 2.1 Accessibility Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
