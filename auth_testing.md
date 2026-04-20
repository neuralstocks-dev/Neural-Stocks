# Emergent Google Auth — Testing Playbook

## Step 1: Create Test User & Session
```bash
mongosh --eval "
use('test_database');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  id: userId,
  email: 'test.user.' + Date.now() + '@example.com',
  full_name: 'Test User',
  plan: 'free',
  google_linked: true,
  created_at: new Date()
});
db.user_sessions.insertOne({
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});
print('Session: ' + sessionToken);
print('User: ' + userId);
"
```

## Step 2: Backend API
```bash
curl -X GET "$API_BASE/api/auth/me" -H "Authorization: Bearer YOUR_JWT"
curl -b "session_token=YOUR_SESSION_TOKEN" "$API_BASE/api/auth/me"
```

## Step 3: Browser testing for cookie-based path
```python
await page.context.add_cookies([{
    "name": "session_token",
    "value": "YOUR_SESSION_TOKEN",
    "domain": "46f95d42-5fd6-4b50-9057-08a57a221843.preview.emergentagent.com",
    "path": "/",
    "httpOnly": True,
    "secure": True,
    "sameSite": "None",
}])
```

## Implementation notes for THIS app
- We keep the existing JWT (email/password) flow. The Google flow calls POST /api/auth/google/session with body {session_id}, backend hits Emergent's /auth/v1/env/oauth/session-data, finds-or-creates the user, and returns {token, user} where token is our own JWT (same shape as /api/auth/login). Frontend stores it in localStorage exactly like the email/password flow.
- This means protected endpoints accept a bearer JWT only — no cookie path needed.
- Session storage in user_sessions collection is OPTIONAL in this MVP; we derive identity from the JWT.

## Failure indicators
- 401 on /api/auth/me after google callback -> JWT not issued, check `/api/auth/google/session` response
- Redirect loop -> AuthProvider's bootstrap /me ran before AuthCallback stored token; ensure AuthProvider skips bootstrap when `window.location.hash` contains `session_id=`
