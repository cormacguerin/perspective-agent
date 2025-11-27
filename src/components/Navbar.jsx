import React from "react";
import { Link } from "react-router-dom";

const Navbar = () => {
  return (
    <div className="navbar bg-gray-900 shadow-lg">
      <div className="container mx-auto">
        <div className="flex-1">
          <Link to="/" className="text-2xl font-semibold text-white">
            Media Uploader
          </Link>
        </div>
        <div className="flex-none">
          <div className="dropdown dropdown-end">
            <button className="btn btn-ghost lg:hidden">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 6h16M4 12h16m-7 6h7"
                />
              </svg>
            </button>
            <ul className="menu menu-compact dropdown-content mt-3 p-2 shadow bg-gray-700 rounded-box w-52">
              <li>
                <Link to="/upload" className="hover:text-gray-400">
                  Upload
                </Link>
              </li>
            </ul>
          </div>
          <div className="hidden lg:flex">
            <Link to="/upload" className="btn btn-ghost text-white">
              Upload
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Navbar;
