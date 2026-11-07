import {useEffect,useState} from 'react'
import {api} from './api'
export function useApi<T=any>(path:string|null,period=4000){
 const [state,setState]=useState<{data:T|null;error:string|null}>({data:null,error:null})
 useEffect(()=>{let live=true;setState({data:null,error:null});if(!path)return;const load=()=>api<T>(path).then(data=>{if(live)setState({data,error:null})}).catch(e=>{if(live)setState(s=>({...s,error:e.message}))});load();const timer=setInterval(load,period);return()=>{live=false;clearInterval(timer)}},[path,period]);return state
}
