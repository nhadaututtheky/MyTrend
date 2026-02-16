/// <reference path="../pb_data/types.d.ts" />

// MyTrend PocketBase Hooks - Main entry point
// Hooks are loaded automatically by PocketBase from pb_hooks/

onAfterBootstrap((e) => {
  console.log('[MyTrend] PocketBase hooks loaded successfully');
});

// Extend user creation with default preferences
onRecordAfterCreateRequest((e) => {
  if (e.collection.name === 'users') {
    console.log('[MyTrend] New user created:', e.record.getId());
  }
}, 'users');
