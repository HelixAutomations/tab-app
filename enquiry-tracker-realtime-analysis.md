# 🔄 Enquiry Tracker Real-Time Update System Analysis

## 📋 **MAIN TRACKING COMPONENTS**
- **Location**: `submodules/enquiry-processing-v2/`
- **Primary Interface**: `wwwroot/enquiry-platform/index.html` + `js/mission-control.js`
- **Database**: `ActivityTrackingService.cs` (instructions database)

## ⚡ **AUTO-REFRESH MECHANISMS**

### **1. Development Hot-Reload (500ms)**
```javascript
// Auto-reload script for development in index.html
let lastModified = null;

async function checkForUpdates() {
    try {
        const response = await fetch('/enquiry-platform/dev-timestamp', {
            method: 'HEAD',
            cache: 'no-cache'
        });
        
        const currentModified = response.headers.get('Last-Modified');
        
        if (lastModified && currentModified && lastModified !== currentModified) {
            console.log('🔄 Changes detected, reloading...');
            location.reload();
        } else if (!lastModified) {
            lastModified = currentModified;
        }
    } catch (error) {
        // Silently fail - endpoint might not exist yet
    }
}

// Check every 500ms for changes
setInterval(checkForUpdates, 500);
```

### **2. Activity Records Fetching**
```javascript
// Mission Control fetches latest enquiry activities
async fetchActivityRecords() {
    // Show loading state
    this.activityRecordsContainer.innerHTML = '<div class="activity-empty">Loading records...</div>';

    const response = await fetch('/api/list-tracked-activities?limit=50', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
    });

    const data = await response.json();
    const records = data.activities || data || [];
    this.renderActivityRecords(records);
}
```

### **3. Manual Refresh Triggers**
```javascript
// Refresh button for manual updates
const refreshActivityBtn = document.getElementById('refreshActivityBtn');
if (refreshActivityBtn) {
    refreshActivityBtn.addEventListener('click', () => this.fetchActivityRecords());
}

// Auto-refresh on endpoint selection
selectEndpoint(endpoint) {
    // ... endpoint setup logic ...
    
    // Refresh activity records to show filtered results
    this.fetchActivityRecords();
}
```

## 🗄️ **DATABASE TRACKING ARCHITECTURE**

### **ActivityTrackingService.cs - Core Data Layer**
```csharp
/// <summary>
/// Service for tracking Teams bot activity in the instructions database
/// </summary>
public class ActivityTrackingService
{
    /// <summary>
    /// Retrieve tracked activities from the database with optional channel filter
    /// </summary>
    public async Task<List<dynamic>> GetTrackedActivitiesAsync(string? channelId = null, int limit = 50)
    {
        var sql = @"
            SELECT TOP (@Limit)
                t.Id, t.ActivityId, t.ChannelId, t.TeamId, t.EnquiryId, t.LeadName, t.Email, t.Phone,
                t.CardType, t.MessageTimestamp, t.Stage, t.Status, t.ClaimedBy, t.ClaimedAt, t.CreatedAt, t.UpdatedAt,
                e.aow as AreaOfWork, e.acid as ActiveCampaignId
            FROM TeamsBotActivityTracking t
            LEFT JOIN enquiries e ON t.EnquiryId = e.id";
    }

    /// <summary>
    /// Store a new activity record after posting a card to Teams
    /// </summary>
    public async Task<long> StoreActivityAsync(TeamsBotActivityRecord record)
    {
        // Stores real-time activity data
    }
}
```

### **EnquiryService.cs - Activity Integration**
```csharp
/// <summary>
/// MODULAR: Activity tracking logic
/// Change this method to modify what gets tracked
/// </summary>
private async Task<long> TrackEnquiryActivity(
    int enquiryId,
    string activityId,
    string channelId,
    string teamId,
    CreateEnquiryRequest request,
    long? messageTimestamp = null)
{
    var record = new TeamsBotActivityRecord
    {
        ActivityId = activityId,
        ChannelId = channelId,
        TeamId = teamId,
        EnquiryId = enquiryId.ToString(),
        LeadName = $"{request.FirstName} {request.LastName}",
        Email = request.Email,
        Phone = request.Phone,
        CardType = cardType,
        MessageTimestamp = finalTimestamp,
        TeamsMessageId = finalTimestamp,
        Stage = "new",
        Status = "active"
    };
    
    return await _trackingService.StoreActivityAsync(record);
}
```

## 📊 **REAL-TIME DATA FLOW**

### **1. Enquiry Creation → Tracking**
```
1. New Enquiry Created (EnquiryService.CreateEnquiryAsync)
   ↓
2. Teams Card Posted (BotMessageService)  
   ↓
3. Activity Recorded (ActivityTrackingService.StoreActivityAsync)
   ↓
4. Database Entry: TeamsBotActivityTracking table
   ↓
5. Mission Control Interface Updates (fetchActivityRecords)
```

### **2. Live Updates Triggers**
- **Manual Refresh**: User clicks refresh button
- **Endpoint Selection**: Changing endpoints triggers auto-refresh  
- **Development Mode**: 500ms file change detection
- **Database Updates**: Real-time tracking of all enquiry actions

### **3. Update Frequency**
- **Development**: Every 500ms (hot-reload)
- **Production**: Manual refresh + event-driven
- **API Calls**: On-demand via user actions
- **Database**: Real-time via SQL triggers

## 🎯 **KEY TRACKING POINTS**

### **What Gets Tracked in Real-Time:**
1. **New Enquiries**: When cards are posted to Teams
2. **Claims**: When team members claim enquiries  
3. **Updates**: Card state changes (claimed, triage, etc.)
4. **AC Integration**: ActiveCampaign contact synchronization
5. **Channel Activity**: Which Teams channel received the card
6. **Timestamps**: Precise timing of all activities

### **Data Available Instantly:**
- **Activity ID**: Teams message identifier
- **Enquiry ID**: Database record identifier  
- **Lead Information**: Name, email, phone
- **Channel Context**: Which Teams channel
- **Claim Status**: Who claimed when
- **Stage Tracking**: Current enquiry stage
- **AC Contact ID**: CRM integration status

## 🔄 **REFRESH STRATEGIES**

### **1. Passive Updates (Real-Time)**
- Database triggers on enquiry changes
- Teams bot activity logging
- AC synchronization events

### **2. Active Polling (User-Driven)**
- Manual refresh buttons
- Endpoint selection triggers
- Filter changes trigger updates

### **3. Development Mode (Aggressive)**
- 500ms file system polling
- Automatic page reloads
- Dev environment only

## 💡 **PERFORMANCE OPTIMIZATIONS**

### **Efficient Querying**
```sql
-- Limited results with JOINs for enriched data
SELECT TOP (@Limit) t.*, e.aow as AreaOfWork, e.acid as ActiveCampaignId
FROM TeamsBotActivityTracking t
LEFT JOIN enquiries e ON t.EnquiryId = e.id
ORDER BY t.CreatedAt DESC
```

### **Filtered Results**
```javascript
// Filter by endpoint/card type for focused views
const endpointToCardType = {
    'commercial': 'commercial_enquiry',
    'construction': 'construction_enquiry', 
    'employment': 'employment_enquiry',
    'facebook': 'meta_lead',
    'incoming': 'incoming_call'
};
```

### **Caching & State Management**
- Team roster caching
- DOM reference caching
- Activity state preservation

## 🎯 **CONCLUSION**

The enquiry tracker maintains **real-time awareness** through:

1. **Immediate Database Logging**: Every enquiry action creates a tracking record
2. **On-Demand Refresh**: User-triggered updates for latest data
3. **Development Hot-Reload**: 500ms polling for code changes
4. **Event-Driven Architecture**: Database changes trigger immediate tracking
5. **Efficient API Design**: Focused queries with JOIN optimization

**Result**: The system stays current within seconds of any enquiry activity, providing real-time visibility into the enquiry pipeline without excessive polling or resource consumption.