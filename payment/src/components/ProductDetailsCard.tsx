import React from "react";
import Image from "next/image";
import { Product } from "@/data/products";
import { MinusIcon, PlusIcon } from "./Icons";

interface ProductDetailsCardProps {
  product: Product;
  quantity: number;
  onQuantityChange: (qty: number) => void;
}

export const ProductDetailsCard: React.FC<ProductDetailsCardProps> = ({
  product,
  quantity,
  onQuantityChange,
}) => {
  const itemTotal = product.price * quantity;
  const formattedItemTotal = `₹${itemTotal.toLocaleString("en-IN")}`;

  const handleDecrement = () => {
    if (quantity > 1) {
      onQuantityChange(quantity - 1);
    }
  };

  const handleIncrement = () => {
    if (quantity < 10) {
      onQuantityChange(quantity + 1);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-sm flex flex-col justify-between">
      <div>
        {/* Section Heading */}
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-5 tracking-tight">
          Product Details
        </h2>

        {/* Selected Product Summary Row */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          {/* Product Thumbnail */}
          <div className="w-32 h-32 sm:w-36 sm:h-36 bg-[#F8FAFC] rounded-2xl p-3 flex items-center justify-center shrink-0 border border-slate-100 relative overflow-hidden">
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              priority
              sizes="(max-width: 640px) 128px, 144px"
              className="object-contain p-2"
            />
          </div>

          {/* Product Meta */}
          <div className="flex-1 text-center sm:text-left">
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug">
              {product.name}
            </h3>
            <p className="text-xl sm:text-2xl font-extrabold text-[#0284C7] mt-1 tracking-tight">
              {product.formattedPrice}
            </p>
            <p className="text-xs sm:text-sm text-slate-500 mt-2 leading-relaxed">
              {product.description}
            </p>

            {/* Quantity Stepper */}
            <div className="flex items-center justify-center sm:justify-start gap-3 mt-4">
              <span className="text-sm font-semibold text-slate-700">Quantity</span>
              <div className="inline-flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden shadow-xs">
                <button
                  type="button"
                  onClick={handleDecrement}
                  disabled={quantity <= 1}
                  aria-label="Decrease quantity"
                  className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer"
                >
                  <MinusIcon />
                </button>
                <span className="w-9 text-center font-bold text-sm text-slate-900 select-none">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={handleIncrement}
                  disabled={quantity >= 10}
                  aria-label="Increase quantity"
                  className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer"
                >
                  <PlusIcon />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Breakdown Divider */}
        <div className="border-t border-slate-100 my-5 sm:my-6" />

        {/* Price Breakdown */}
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between text-slate-600">
            <span>Price ({quantity} {quantity === 1 ? "item" : "items"})</span>
            <span className="font-semibold text-slate-900">{formattedItemTotal}</span>
          </div>
          <div className="flex items-center justify-between text-slate-600">
            <span>Shipping Fee</span>
            <span className="font-semibold text-emerald-600">FREE</span>
          </div>
        </div>

        <div className="border-t border-slate-100 my-5" />
      </div>

      {/* Total Amount Row */}
      <div className="flex items-center justify-between pt-2">
        <span className="text-base sm:text-lg font-bold text-slate-900">Total Amount</span>
        <span className="text-2xl sm:text-3xl font-extrabold text-[#0284C7] tracking-tight">
          {formattedItemTotal}
        </span>
      </div>
    </div>
  );
};
