import React, { useEffect, useState } from 'react';
import './ProductList.css';

const categories = ['Eatables', 'Fashion', 'Grocery', 'Clothes', 'Electronics'];

function ProductList({ addToCart }) {
  const [products, setProducts] = useState([]);
  const [groupedProducts, setGroupedProducts] = useState({});
  const [cart, setCart] = useState([]);

  useEffect(() => {
    fetch('http://localhost:8080/api/products')
      .then(res => res.json())
      .then(data => {
        setProducts(data);
        groupByCategory(data);
      })
      .catch(err => console.error("Failed to fetch products", err));
  }, []);

  const groupByCategory = (products) => {
    const grouped = {};
    for (const product of products) {
      const cat = product.category || 'Uncategorized';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(product);
    }
    setGroupedProducts(grouped);
  };

  const handleAddToCart = (product) => {
    if (!cart.find(p => p.sku === product.sku)) {
      setCart([...cart, product]);
      addToCart?.(product);
    }
  };

  return (
    <div className="page-container">
      <header className="header">
        <h1>Walmart Pro</h1>
      </header>
      
      <div className="main-content">
        {/* Left: Product List */}
        <div className="product-area">
          <h2>Products</h2>
          <div className="category-tabs">
            {categories.map((cat, index) => (
              <button key={index} className="category-tab">{cat}</button>
            ))}
          </div>
          <div className="product-section">
            {products.length === 0 ? (
              <div className="loading">Loading products...</div>
            ) : (
              <div className="product-grid">
                {products.map((product) => (
                  <div key={product.sku} className="product-card" onClick={() => handleAddToCart(product)}>
                    <div className="product-info">
                      <div className="product-name">{product.name}</div>
                      <div className="product-category">Category: {product.category || 'Uncategorized'}</div>
                      <div className="product-price">${product.price?.toFixed(2) || '0.00'}</div>
                      <button className="add-to-cart-btn" onClick={(e) => {
                        e.stopPropagation();
                        handleAddToCart(product);
                      }}>Add to cart</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductList;