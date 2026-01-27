# SignTouch Supabase Configuration

## Deployment Instructions

### 1. Apply Database Migration

Run the SQL migration to create tables, indexes, and RPC functions:

```bash
# Using Supabase CLI
supabase db push

# Or manually in Supabase Dashboard > SQL Editor
# Copy and run the contents of migrations/20260127_event_sessions_schema.sql
```

### 2. Deploy Edge Functions

```bash
# Login to Supabase
supabase login

# Link your project
supabase link --project-ref wwuxaoggbvgmyzcjlgfx

# Deploy the joinEvent function
supabase functions deploy joinEvent --no-verify-jwt

# Or deploy all functions
supabase functions deploy --no-verify-jwt
```

### 3. Environment Variables

The Edge Function uses these environment variables (automatically set by Supabase):
- `SUPABASE_URL` - Your project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for admin access

### 4. Testing the Edge Function

```bash
# Test with curl
curl -X POST "https://wwuxaoggbvgmyzcjlgfx.supabase.co/functions/v1/joinEvent" \
  -H "Content-Type: application/json" \
  -d '{"join_code": "ABC123", "viewer_id": "test-device-123"}'
```

## Client Usage (Expo/React Native)

```typescript
import { supabase } from '@/utils/supabase';

// Option 1: Use Edge Function directly
const joinEventViaEdgeFunction = async (joinCode: string, viewerId: string) => {
  const response = await fetch(
    `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/joinEvent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        join_code: joinCode,
        viewer_id: viewerId,
      }),
    }
  );
  return response.json();
};

// Option 2: Use RPC function directly (also atomic)
const joinEventViaRPC = async (joinCode: string, viewerId: string) => {
  const { data, error } = await supabase.rpc('join_event', {
    p_join_code: joinCode,
    p_viewer_id: viewerId,
  });
  return data;
};

// Handle response
const result = await joinEventViaEdgeFunction('ABC123', 'device-id-123');
if (result.allowed) {
  console.log('Joined event:', result.event.title);
  console.log('Signers:', result.signers);
} else {
  switch (result.reason) {
    case 'full':
      alert('Event is full. Please try again later.');
      break;
    case 'ended':
      alert('This event has ended.');
      break;
    case 'not_found':
      alert('Event not found. Check the code and try again.');
      break;
    default:
      alert(result.message || 'Unable to join event.');
  }
}
```

## API Reference

### POST /functions/v1/joinEvent

Atomically joins a viewer to an event session.

**Request Body:**
```json
{
  "join_code": "ABC123",
  "viewer_id": "device-or-user-id"
}
```

**Success Response (200):**
```json
{
  "allowed": true,
  "event": {
    "id": "uuid",
    "title": "Event Title",
    "status": "live",
    "starts_at": "2026-01-27T10:00:00Z",
    "ends_at": "2026-01-27T12:00:00Z",
    "viewer_soft_limit": 5000
  },
  "signers": [
    {
      "id": "uuid",
      "display_name": "Celebrity Name",
      "avatar_url": null,
      "signature_url": "https://..."
    }
  ]
}
```

**Error Responses:**

| Status | Reason | Description |
|--------|--------|-------------|
| 400 | `bad_request` | Invalid input |
| 400 | `not_found` | Event not found |
| 400 | `ended` | Event has ended |
| 400 | `not_live` | Event not currently live |
| 429 | `full` | Event at viewer capacity |

## Database Schema

### Tables

- `event_sessions` - Event metadata and configuration
- `event_signers` - Celebrities participating in events
- `event_assets` - Photos and signatures published during events
- `event_viewers` - Active viewers with heartbeat tracking

### RPC Functions

- `join_event(p_join_code, p_viewer_id)` - Atomic join with cleanup
- `update_viewer_heartbeat(p_event_id, p_viewer_id)` - Update presence
- `leave_event(p_event_id, p_viewer_id)` - Remove viewer
- `get_active_viewer_count(p_event_id)` - Count active viewers

## Security

- Edge Function uses Service Role Key (never exposed to client)
- RPC functions use SECURITY DEFINER for admin operations
- RLS policies restrict direct table access
- Viewer management only through RPC functions
