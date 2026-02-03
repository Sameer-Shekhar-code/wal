import React, { useState, useEffect, useCallback, useRef } from 'react';

import {
  fetchAllProducts, fetchAllWaypoints, assignProductToWaypoint,
  createProduct, createWaypoint, updateProduct, deleteProduct,
  getSettings, updateSettingLocation, connectWaypoints,
  updateWaypointLocation, deleteWaypoint
} from './api';
import ProductForm from './ProductForm';
import FloorPlanUploader from './FloorPlanUploader';
import MessageDisplay from './MessageDisplay';
import './AdminPage.css';

function AdminPage() {
  const [products, setProducts] = useState([]);
  const [waypoints, setWaypoints] = useState([]);
  const [settings, setSettings] = useState(null);
  const [activeTab, setActiveTab] = useState('placement');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productToEdit, setProductToEdit] = useState(null);
  const [settingMode, setSettingMode] = useState(null);
  const [firstWaypointToConnect, setFirstWaypointToConnect] = useState(null);
  const [waypointToMove, setWaypointToMove] = useState(null);
  const [message, setMessage] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // New state for map dimensions
  const [mapNaturalDimensions, setMapNaturalDimensions] = useState({ width: 0, height: 0 });
  const mapRef = useRef(null);

  const loadData = useCallback(async () => {
    try {
      const [productsData, waypointsData, settingsData] = await Promise.all([
        fetchAllProducts(), fetchAllWaypoints(), getSettings()
      ]);
      setProducts(Array.isArray(productsData) ? productsData : []);
      setWaypoints(Array.isArray(waypointsData) ? waypointsData : []);
      setSettings(settingsData);
    } catch (error) {
      setMessage("Error: Could not load data from server.");
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleMapImageLoad = (e) => {
    setMapNaturalDimensions({
      width: e.target.naturalWidth,
      height: e.target.naturalHeight,
    });
  };

  const handleMapClick = async (e) => {
    if (!settingMode || !mapRef.current || mapNaturalDimensions.width === 0) return;

    const rect = mapRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const normalizedX = clickX / rect.width;
    const normalizedY = clickY / rect.height;

    const x = Math.round(normalizedX * mapNaturalDimensions.width);
    const y = Math.round(normalizedY * mapNaturalDimensions.height);

    const newLocation = { x, y, z: 0 };

    try {
      if (settingMode === 'entrance' || settingMode === 'checkout') {
        setSettings(await updateSettingLocation(settingMode, newLocation));
        setMessage(`Updated ${settingMode} location.`);
        setSettingMode(null);
      } else if (settingMode === 'waypoint_create') {
        await createWaypoint(newLocation);
        setMessage(`New waypoint created at (${x}, ${y}).`);
        await loadData();
      } else if (settingMode === 'waypoint_move_end' && waypointToMove) {
        await updateWaypointLocation(waypointToMove.id, newLocation);
        setMessage(`Moved waypoint ${waypointToMove.id} to (${x}, ${y}).`);
        setWaypointToMove(null);
        setSettingMode(null);
        await loadData();
      }
    } catch (error) {
      setMessage(`Error performing action for ${settingMode}.`);
    }
  };

  const handleWaypointClick = async (waypoint) => {
    if (settingMode === 'connect') {
      if (!firstWaypointToConnect) {
        setFirstWaypointToConnect(waypoint);
        setMessage(`Selected waypoint ${waypoint.id}. Click another to connect.`);
      } else {
        try {
          await connectWaypoints(firstWaypointToConnect.id, waypoint.id);
          setMessage(`Connected ${firstWaypointToConnect.id} and ${waypoint.id}.`);
          setFirstWaypointToConnect(null);
          await loadData();
        } catch (error) {
          setMessage("Error connecting waypoints.");
          setFirstWaypointToConnect(null);
        }
      }
    } else if (settingMode === 'waypoint_move_start') {
      setWaypointToMove(waypoint);
      setSettingMode('waypoint_move_end');
      setMessage(`Moving waypoint ${waypoint.id}. Click new location on map.`);
    } else if (settingMode === 'waypoint_delete') {
      if (window.confirm(`Delete waypoint ${waypoint.id}?`)) {
        try {
          await deleteWaypoint(waypoint.id);
          setMessage(`Deleted waypoint ${waypoint.id}.`);
          setSettingMode(null);
          await loadData();
        } catch (error) {
          setMessage("Error deleting waypoint.");
        }
      }
    } else if (activeTab === 'placement' && selectedProduct) {
      try {
        const updatedProduct = await assignProductToWaypoint(selectedProduct.sku, waypoint.id);
        setProducts(products.map(p => p.sku === updatedProduct.sku ? updatedProduct : p));
        setSelectedProduct(updatedProduct);
        setMessage(`Assigned ${updatedProduct.name} to waypoint ${waypoint.id}.`);
      } catch (error) {
        setMessage("Error assigning product.");
      }
    }
  };

  const handleFormSubmit = async (productData, isEditing) => {
    try {
      const result = isEditing
        ? await updateProduct(productData.sku, productData)
        : await createProduct(productData);
      setProducts(prev => isEditing
        ? prev.map(p => p.sku === result.sku ? result : p)
        : [...prev, result]);
      setMessage(`Product ${productData.name} ${isEditing ? 'updated' : 'created'}.`);
      setProductToEdit(null);
    } catch (error) {
      setMessage("Error saving product.");
    }
  };

  const handleDeleteClick = async (sku) => {
    if (window.confirm(`Delete product ${sku}?`)) {
      try {
        await deleteProduct(sku);
        setProducts(products.filter(p => p.sku !== sku));
        setMessage(`Product ${sku} deleted.`);
      } catch (error) {
        setMessage("Error deleting product.");
      }
    }
  };

  const handleDeleteAllWaypoints = async () => {
    if (window.confirm("Are you sure you want to delete ALL waypoints? This action cannot be undone.")) {
      setMessage("Deleting all waypoints...");
      try {
        for (const waypoint of waypoints) {
          await deleteWaypoint(waypoint.id);
        }
        setMessage("All waypoints deleted successfully.");
        await loadData();
        cancelAllModes();
      } catch (error) {
        setMessage("Error deleting all waypoints. Some might remain.");
      }
    }
  };

  const cancelAllModes = () => {
    setSettingMode(null);
    setFirstWaypointToConnect(null);
    setWaypointToMove(null);
  };

  const renderMapWithOverlays = () => {
    const waypointMap = new Map(waypoints.map(wp => [wp.id, wp]));

    const getPercentagePosition = (location) => {
      if (!location || mapNaturalDimensions.width === 0 || mapNaturalDimensions.height === 0) {
        return { left: '0%', top: '0%' };
      }
      const left = (location.x / mapNaturalDimensions.width) * 100;
      const top = (location.y / mapNaturalDimensions.height) * 100;
      return { left: `${left}%`, top: `${top}%` };
    };

    return (
      <div className="map-container" ref={mapRef} onClick={handleMapClick}>
        <img
          src="/walmart-map.svg"
          alt="Store Map"
          className="map-image"
          onLoad={handleMapImageLoad}
        />
        <svg className="path-overlay">
          {waypoints.map(wp => wp.connections?.map(toId => {
            const toWp = waypointMap.get(toId);
            if (!toWp || mapNaturalDimensions.width === 0 || mapNaturalDimensions.height === 0) return null;

            const fromPos = getPercentagePosition(wp.location);
            const toPos = getPercentagePosition(toWp.location);

            const rect = mapRef.current.getBoundingClientRect();
            const x1 = parseFloat(fromPos.left) / 100 * rect.width;
            const y1 = parseFloat(fromPos.top) / 100 * rect.height;
            const x2 = parseFloat(toPos.left) / 100 * rect.width;
            const y2 = parseFloat(toPos.top) / 100 * rect.height;

            return (
              <line
                key={`${wp.id}-${toId}`}
                x1={x1} y1={y1}
                x2={x2} y2={y2}
                stroke="rgba(0,100,255,0.5)"
                strokeWidth="2"
              />
            );
          }))}
        </svg>

        {waypoints.map(wp => (
          <div
            key={wp.id}
            className={`waypoint-dot ${firstWaypointToConnect?.id === wp.id ? 'connecting' : ''} ${waypointToMove?.id === wp.id ? 'moving' : ''}`}
            style={getPercentagePosition(wp.location)}
            onClick={(e) => { e.stopPropagation(); handleWaypointClick(wp); }}
            title={`Waypoint ${wp.id}`}
          ></div>
        ))}

        {settings?.entranceLocation && (
          <div
            className="setting-dot entrance"
            style={getPercentagePosition(settings.entranceLocation)}
          >E</div>
        )}
        {settings?.checkoutLocation && (
          <div
            className="setting-dot checkout"
            style={getPercentagePosition(settings.checkoutLocation)}
          >C</div>
        )}
      </div>
    );
  };

  const renderSidebarContent = () => {
    if (activeTab === 'placement') {
      return (
        <div className="sidebar-content">
          <div className="product-list-section">
            <h3>Product List</h3>
            <div className="product-grid">
              {products.map(p => (
                <div
                  key={p.sku}
                  className={`product-card ${selectedProduct?.sku === p.sku ? 'selected' : ''}`}
                  onClick={() => setSelectedProduct(p)}
                >
                  <div className="product-info">
                    <h4>{p.name}</h4>
                    <p className="product-category">{p.category}</p>
                    <p className="product-sku">SKU: {p.sku}</p>
                  </div>
                  <div className="product-status">
                    <span className={`status-badge ${p.waypointId ? 'placed' : 'not-placed'}`}>
                      {p.waypointId ? 'PLACED' : 'NOT PLACED'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (activeTab === 'management') {
      return (
        <div className="sidebar-content">
          <div className="management-section">
            <ProductForm 
              productToEdit={productToEdit} 
              onFormSubmit={handleFormSubmit} 
              onCancelEdit={() => setProductToEdit(null)} 
            />
            
            <h3>Product Management</h3>
            <div className="product-management-grid">
              {products.map(p => (
                <div key={p.sku} className="product-management-card">
                  <div className="product-details">
                    <h4>{p.name}</h4>
                    <p>Category: {p.category}</p>
                    <p>SKU: {p.sku}</p>
                    <p>Waypoint: {p.waypointId || 'N/A'}</p>
                  </div>
                  <div className="product-actions">
                    <button 
                      className="btn btn-primary"
                      onClick={() => setProductToEdit(p)}
                    >
                      EDIT
                    </button>
                    <button 
                      className="btn btn-danger"
                      onClick={() => handleDeleteClick(p.sku)}
                    >
                      DELETE
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (activeTab === 'settings') {
      return (
        <div className="sidebar-content">
          <div className="settings-section">
            <div className="settings-group">
              <h3>Store Settings</h3>
              <div className="button-group">
                <button 
                  className="btn btn-outline"
                  onClick={() => setSettingMode('entrance')} 
                  disabled={!!settingMode}
                >
                  Set Entrance
                </button>
                <button 
                  className="btn btn-outline"
                  onClick={() => setSettingMode('checkout')} 
                  disabled={!!settingMode}
                >
                  Set Checkout
                </button>
              </div>
            </div>

            <div className="settings-group">
              <h3>Waypoint Tools</h3>
              <div className="button-group">
                <button 
                  className="btn btn-outline"
                  onClick={() => setSettingMode('waypoint_create')} 
                  disabled={!!settingMode}
                >
                  Create Waypoint
                </button>
                <button 
                  className="btn btn-outline"
                  onClick={() => setSettingMode('connect')} 
                  disabled={!!settingMode}
                >
                  Connect Waypoints
                </button>
                <button 
                  className="btn btn-outline"
                  onClick={() => setSettingMode('waypoint_move_start')} 
                  disabled={!!settingMode}
                >
                  Move Waypoint
                </button>
                <button 
                  className="btn btn-outline"
                  onClick={() => setSettingMode('waypoint_delete')} 
                  disabled={!!settingMode}
                >
                  Delete Waypoint
                </button>
                <button 
                  className="btn btn-danger"
                  onClick={handleDeleteAllWaypoints} 
                  disabled={!!settingMode || waypoints.length === 0}
                >
                  Delete All Waypoints
                </button>
              </div>
              {settingMode && (
                <button className="btn btn-secondary" onClick={cancelAllModes}>
                  Cancel
                </button>
              )}
            </div>

            <div className="settings-group">
              <h3>Floor Plan</h3>
              <FloorPlanUploader onUploadSuccess={loadData} />
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="admin-page">
      {/* Header */}
      <header className="admin-header">
        <div className="header-left">
          <h1>Walmart Pro</h1>
          <div className="header-subtitle">Admin Dashboard</div>
        </div>
        <nav className="header-tabs">
          <button 
            className={`tab-button ${activeTab === 'placement' ? 'active' : ''}`}
            onClick={() => setActiveTab('placement')}
          >
            ITEM PLACEMENT
          </button>
          <button 
            className={`tab-button ${activeTab === 'management' ? 'active' : ''}`}
            onClick={() => setActiveTab('management')}
          >
            PRODUCT PLACEMENT
          </button>
          <button 
            className={`tab-button ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            FLOOR PLAN
          </button>
        </nav>
      </header>

      {/* Main Content */}
      <div className="admin-content">
        {/* Sidebar */}
        <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
          <button 
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
          
          <MessageDisplay message={message} clearMessage={() => setMessage('')} />
          
          <div className="mode-status">
            {settingMode ? `Mode: ${settingMode}` : 
             selectedProduct ? `Placing: ${selectedProduct.name}` : 
             'Select a product'}
          </div>
          
          {renderSidebarContent()}
        </aside>

        {/* Map Area */}
        <main className="map-area">
          {renderMapWithOverlays()}
        </main>
      </div>
    </div>
  );
}

export default AdminPage;