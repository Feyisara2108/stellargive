import React, { useState } from "react";
import { useWallet } from "@/lib/WalletProvider";
import { useQuery } from "@tanstack/react-query";

export const ComponentModule31 = () => {
  const { isConnected, address } = useWallet();
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [clicked, setClicked] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['module31Data'],
    queryFn: async () => {
      return { message: 'Hello from query 31' };
    }
  });

  return (
    <div>
      <h1>Module 31</h1>
      {isConnected ? <p>Connected as {address}</p> : <p>Not connected</p>}
      {isLoading ? <p>Loading...</p> : <p>{data?.message}</p>}
      <input 
        data-testid="mod31-input"
        value={inputValue} 
        onChange={(e) => setInputValue(e.target.value)} 
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      />
      {isFocused && <span>Input is focused</span>}
      <button data-testid="mod31-button" onClick={() => setClicked(true)}>Click Me 31</button>
      {clicked && <span>Button was clicked</span>}
    </div>
  );
};
