import React from "react";
import Image from "next/image";
import { Product } from "@/data/products";
import { LockIcon } from "./Icons";

interface ProductCardProps {
  product: Product;
  onBuy: (product: Product) => void;
  isBuying?: boolean;
  priority?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onBuy,
  isBuying = false,
  priority = false,
}) => {
  return (
    <div className="group relative flex flex-col justify-between p-4 sm:p-5 rounded-2xl transition-all duration-200 bg-white border border-slate-200/90 hover:border-slate-300 hover:shadow-lg">
      {/* Clean Studio Image Display Box */}
      <div className="w-full h-48 sm:h-52 bg-slate-50/70 rounded-xl flex items-center justify-center p-3 mb-4 overflow-hidden relative border border-slate-100/80">
        <Image
          src={product.imageUrl}
          alt={product.name}
          fill
          priority={priority}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          className="object-contain p-2 transition-transform duration-300 group-hover:scale-105"
        />
        {product.badge && (
          <span className="absolute top-2.5 right-2.5 px-2.5 py-1 text-[11px] font-bold text-[#0284C7] bg-white/95 backdrop-blur-xs rounded-full shadow-xs border border-sky-100">
            {product.badge}
          </span>
        )}
      </div>

      {/* Product Information */}
      <div className="flex flex-col flex-1 justify-between gap-3">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {product.category}
          </span>
          <h3 className="font-bold text-sm sm:text-base text-slate-900 leading-snug line-clamp-1 mt-0.5">
            {product.name}
          </h3>
          <p className="text-xs text-slate-500 line-clamp-2 mt-1 leading-relaxed">
            {product.description}
          </p>
        </div>

        {/* Price & Direct Buy Now Button */}
        <div className="pt-2 border-t border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Price</span>
            <span className="text-xl sm:text-2xl font-extrabold text-[#0284C7] tracking-tight">
              {product.formattedPrice}
            </span>
          </div>

          <button
            type="button"
            onClick={() => onBuy(product)}
            disabled={isBuying}
            className="w-full py-2.5 sm:py-3 px-4 bg-[#0080FF] hover:bg-[#0070E0] active:scale-[0.99] disabled:opacity-75 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm sm:text-base flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition-all cursor-pointer"
          >
            {isBuying ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>Processing...</span>
              </>
            ) : (
              <>
                <LockIcon className="w-4 h-4" />
                <span>Buy Now • {product.formattedPrice}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
