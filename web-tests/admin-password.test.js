import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePasswordChange} from '../src/admin-password.js';

test('requires the current password',()=>{
  assert.match(validatePasswordChange('', 'safe-long-password', 'safe-long-password'), /lama/i);
});
test('requires twelve characters for a new password',()=>{
  assert.match(validatePasswordChange('old', 'short', 'short'), /12/);
});
test('rejects new passwords above 256 characters',()=>{
  const candidate='a'.repeat(257);
  assert.match(validatePasswordChange('old', candidate, candidate), /256/);
});
test('requires matching confirmation',()=>{
  assert.match(validatePasswordChange('old', 'long-password-one', 'long-password-two'), /cocok/i);
});
test('accepts a valid new password',()=>{
  assert.equal(validatePasswordChange('old', 'my-long-password', 'my-long-password'), '');
});
