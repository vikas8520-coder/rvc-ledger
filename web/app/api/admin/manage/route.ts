import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth';
import {
  adminUpdateCustomer,
  adminDeleteCustomer,
  adminUpdateTransaction,
  adminDeleteTransaction,
  adminDeletePurchase,
  adminDeleteSupplier,
  adminDeleteCatalogItem,
  adminUpdateCatalogItem,
  isDbConfigured,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    await requireAdminAuth();
    if (!isDbConfigured()) {
      return NextResponse.json({ error: 'DB not configured' }, { status: 500 });
    }
    const body = await request.json();
    const { action, shopId, entityType, entityId, data } = body;

    if (!shopId || !action || !entityType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Customer operations
    if (entityType === 'customer') {
      if (action === 'update' && entityId) {
        await adminUpdateCustomer(entityId, shopId, data || {});
        return NextResponse.json({ ok: true });
      }
      if (action === 'delete' && entityId) {
        await adminDeleteCustomer(entityId, shopId);
        return NextResponse.json({ ok: true });
      }
    }

    // Transaction operations
    if (entityType === 'transaction') {
      if (action === 'update' && entityId) {
        await adminUpdateTransaction(entityId, shopId, data || {});
        return NextResponse.json({ ok: true });
      }
      if (action === 'delete' && entityId) {
        await adminDeleteTransaction(entityId, shopId);
        return NextResponse.json({ ok: true });
      }
    }

    // Purchase operations
    if (entityType === 'purchase') {
      if (action === 'delete' && entityId) {
        await adminDeletePurchase(entityId, shopId);
        return NextResponse.json({ ok: true });
      }
    }

    // Supplier operations
    if (entityType === 'supplier') {
      if (action === 'delete' && entityId) {
        await adminDeleteSupplier(entityId, shopId);
        return NextResponse.json({ ok: true });
      }
    }

    // Catalog item operations
    if (entityType === 'catalogItem') {
      if (action === 'update' && entityId) {
        await adminUpdateCatalogItem(entityId, shopId, data || {});
        return NextResponse.json({ ok: true });
      }
      if (action === 'delete' && entityId) {
        await adminDeleteCatalogItem(entityId, shopId);
        return NextResponse.json({ ok: true });
      }
    }

    return NextResponse.json({ error: 'Unknown action or entity type' }, { status: 400 });
  } catch (err: any) {
    const status = err.status || 500;
    return NextResponse.json({ error: err.message || 'Failed' }, { status });
  }
}
