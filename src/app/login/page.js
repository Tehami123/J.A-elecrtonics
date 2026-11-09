'use client';import {fetchApi} from '@/lib/client-cache';
import {useState} from 'react';

export default function Login(){
 const [username,setUsername]=useState('');
 const [password,setPassword]=useState('');
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(false);
 async function signIn(event){
  event.preventDefault();setError('');setLoading(true);
  try{
   const response=await fetchApi('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
   if(response.ok){window.location.assign('/');return}
   const result=await response.json();setError(result.error||'Unable to sign in. Please try again.');
  }catch{setError('Unable to connect. Please try again.')}
  finally{setLoading(false)}
 }
 return <main className="login-shell"><form className="card login-card" onSubmit={signIn}>
  <div className="brand-mark" aria-hidden="true">J.A</div>
  <div className="login-heading"><h1>Welcome back</h1><p>Sign in to your J.A Electronics workspace.</p></div>
  <label className="field"><span>Username</span><input required autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)}/></label>
  <label className="field"><span>Password</span><input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
  {error&&<div className="login-error" role="alert">{error}</div>}
  <button className="button primary" type="submit" disabled={loading}>{loading?'Signing in…':'Sign in'}</button>
 </form></main>
}
