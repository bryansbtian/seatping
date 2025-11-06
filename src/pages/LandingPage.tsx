import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { CheckCircle } from "@mynaui/icons-react";
import {
  Clock,
  Smartphone,
  Bell,
  ClipboardList,
  Users,
  Rocket,
  TrendingUp,
  Star,
  BarChart3,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useState } from "react";

const LandingPage = () => {
  const [chartView, setChartView] = useState<"daily" | "weekly">("daily");

  const dailyData = [
    { date: "Oct 30", served: 12, avgWait: 15, noShows: 2 },
    { date: "Oct 31", served: 18, avgWait: 12, noShows: 1 },
    { date: "Nov 1", served: 25, avgWait: 10, noShows: 3 },
    { date: "Nov 2", served: 22, avgWait: 14, noShows: 2 },
    { date: "Nov 3", served: 30, avgWait: 8, noShows: 5 },
    { date: "Nov 4", served: 35, avgWait: 7, noShows: 8 },
    { date: "Nov 5", served: 40, avgWait: 6, noShows: 11 },
  ];

  const weeklyData = [
    { date: "Week 1", served: 120, avgWait: 18, noShows: 15 },
    { date: "Week 2", served: 145, avgWait: 15, noShows: 12 },
    { date: "Week 3", served: 180, avgWait: 12, noShows: 20 },
    { date: "Week 4", served: 210, avgWait: 10, noShows: 18 },
    { date: "Week 5", served: 195, avgWait: 11, noShows: 22 },
    { date: "Week 6", served: 235, avgWait: 9, noShows: 25 },
  ];

  const chartData = chartView === "daily" ? dailyData : weeklyData;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero Section */}
      <section className="pt-28 md:pt-32 lg:pt-40 pb-20 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="space-y-8">
            {/* Hero text */}
            <div className="space-y-6 max-w-4xl mx-auto text-center px-4">
              <h1 className="text-4xl sm:text-5xl md:text-7xl font-medium leading-tight">
                Queues Without the Queue
              </h1>
              <p className="text-lg sm:text-xl md:text-2xl text-slate-600 leading-relaxed max-w-3xl mx-auto">
                Customers join by QR, get SMS, and show up right on time.
              </p>
            </div>

            {/* Button row */}
            <div className="flex justify-center">
              <Button
                size="lg"
                asChild
                className="group inline-flex items-center gap-2 rounded-xl bg-slate-900 text-white px-6 md:px-8 shadow-sm hover:bg-slate-800 transition"
              >
                <Link to="/signup">
                  <Rocket
                    className="h-4 w-4 -ml-1 opacity-90 transition-transform group-hover:-translate-y-0.5"
                    aria-hidden="true"
                  />
                  <span className="font-medium">Get Started Free</span>
                </Link>
              </Button>
            </div>

            {/* Dashboard Preview */}
            <div className="relative mt-16 w-full">
              <div className="rounded-2xl shadow-2xl border border-slate-200 bg-slate-50 p-6 md:p-8">
                {/* Dashboard Header */}
                <div className="bg-white rounded-xl shadow-sm p-4 md:p-6 mb-6">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <h2 className="text-xl md:text-2xl font-semibold text-slate-800">
                        Hello Cafe Milano!
                      </h2>
                      <p className="text-slate-600 text-sm md:text-base">
                        Here is your daily statistic
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">
                          Customer Credits: 285
                        </span>
                        <span className="text-xs bg-teal-100 text-teal-700 px-2 py-1 rounded">
                          SMS Credits: 291
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Clock className="w-4 h-4" />
                        <span>Aug 22, 2025</span>
                      </div>
                      <div className="relative">
                        <select className="appearance-none bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                          <option>Downtown</option>
                        </select>
                        <ClipboardList className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4 mb-6">
                  <Card className="p-3 md:p-4 bg-white rounded-xl shadow-sm border-0">
                    <div className="flex flex-col gap-2">
                      <p className="text-slate-600 text-xs md:text-sm">
                        Total Queue
                      </p>
                      <div className="flex items-center justify-between">
                        <p className="text-2xl md:text-3xl font-semibold text-slate-800">
                          3
                        </p>
                        <div className="p-2 bg-indigo-100 rounded-full">
                          <Users className="w-5 h-5 md:w-6 md:h-6 text-indigo-600" />
                        </div>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-3 md:p-4 bg-white rounded-xl shadow-sm border-0">
                    <div className="flex flex-col gap-2">
                      <p className="text-slate-600 text-xs md:text-sm">
                        Avg Wait Time
                      </p>
                      <div className="flex items-center justify-between">
                        <p className="text-2xl md:text-3xl font-semibold text-slate-800">
                          5m
                        </p>
                        <div className="p-2 bg-teal-100 rounded-full">
                          <Clock className="w-5 h-5 md:w-6 md:h-6 text-teal-600" />
                        </div>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-3 md:p-4 bg-white rounded-xl shadow-sm border-0">
                    <div className="flex flex-col gap-2">
                      <p className="text-slate-600 text-xs md:text-sm">
                        Served Today
                      </p>
                      <div className="flex items-center justify-between">
                        <p className="text-2xl md:text-3xl font-semibold text-slate-800">
                          8
                        </p>
                        <div className="p-2 bg-teal-100 rounded-full">
                          <TrendingUp className="w-5 h-5 md:w-6 md:h-6 text-teal-600" />
                        </div>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-3 md:p-4 bg-white rounded-xl shadow-sm border-0">
                    <div className="flex flex-col gap-2">
                      <p className="text-slate-600 text-xs md:text-sm">
                        Success Rate
                      </p>
                      <div className="flex items-center justify-between">
                        <p className="text-2xl md:text-3xl font-semibold text-slate-800">
                          88%
                        </p>
                        <div className="p-2 bg-violet-100 rounded-full">
                          <Star className="w-5 h-5 md:w-6 md:h-6 text-violet-600" />
                        </div>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-3 md:p-4 bg-white rounded-xl shadow-sm border-0">
                    <div className="flex flex-col gap-2">
                      <p className="text-slate-600 text-xs md:text-sm">
                        Left Today
                      </p>
                      <div className="flex items-center justify-between">
                        <p className="text-2xl md:text-3xl font-semibold text-slate-800">
                          1
                        </p>
                        <div className="p-2 bg-teal-100 rounded-full">
                          <Users className="w-5 h-5 md:w-6 md:h-6 text-teal-600" />
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>

                {/* Queue Management */}
                <div className="bg-white rounded-xl shadow-sm border-0 p-4 md:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg md:text-xl font-semibold text-slate-800">
                        Queue Management
                      </h3>
                      <p className="text-sm text-slate-600">
                        Managing queue for: Downtown
                      </p>
                    </div>
                    <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 text-[10px] sm:text-xs md:text-sm px-2 py-1 sm:px-3 whitespace-nowrap mt-1 sm:mt-1.5">
                      3 customers
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    {[
                      {
                        position: 1,
                        name: "Jessica Martinez",
                        joined: "Just now",
                        guests: 2,
                        preference: "Stay on Premises",
                        phone: "555-0123",
                      },
                      {
                        position: 2,
                        name: "David Kim",
                        joined: "5 mins ago",
                        guests: 4,
                        preference: "Wait Outside",
                        phone: "(123) 456-7890",
                      },
                      {
                        position: 3,
                        name: "Rachel Thompson",
                        joined: "8 mins ago",
                        guests: 1,
                        preference: "Stay on Premises",
                        phone: "555-0789",
                      },
                    ].map((customer) => (
                      <div
                        key={customer.position}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200"
                      >
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
                            <span className="text-base font-semibold text-white">
                              {customer.position}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-900 text-sm md:text-base">
                              {customer.name}
                            </p>
                            <p className="text-xs md:text-sm text-slate-600">
                              Joined: {customer.joined} • {customer.guests}{" "}
                              guest
                              {customer.guests > 1 ? "s" : ""} •{" "}
                              {customer.preference}
                            </p>
                            {customer.preference !== "Stay on Premises" && (
                              <p className="text-xs text-slate-500 mt-1">
                                Phone: {customer.phone}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 sm:flex-shrink-0 w-full sm:w-auto">
                          <Button
                            size="sm"
                            className="bg-teal-600 hover:bg-teal-700 text-white text-xs md:text-sm flex-1 sm:flex-none"
                          >
                            Admit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-slate-300 text-slate-700 hover:bg-slate-100 text-xs md:text-sm flex-1 sm:flex-none"
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-12 bg-slate-50 border-y border-slate-200">
        <div className="container mx-auto px-4">
          <p className="text-center text-slate-500 mb-8 text-sm">
            Trusted by businesses everywhere.
          </p>
          <div className="flex flex-wrap justify-center gap-x-12 gap-y-6 items-center">
            <div className="text-center">
              <p className="text-3xl font-semibold text-slate-900">500+</p>
              <p className="text-sm text-slate-500">Active Businesses</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-semibold text-slate-900">50k+</p>
              <p className="text-sm text-slate-500">Customers Served</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-semibold text-slate-900">2min</p>
              <p className="text-sm text-slate-500">Setup Time</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-semibold text-slate-900">0</p>
              <p className="text-sm text-slate-500">Hardware Needed</p>
            </div>
          </div>
        </div>
      </section>

      {/* Meet SeatPing Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-16 px-4">
            <p className="text-sm text-slate-500 mb-4">Key Features</p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-slate-900 mb-6">
              Meet SeatPing
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-slate-600 max-w-3xl mx-auto">
              The digital queue to hold, notify, and serve every walk-in
              customer.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-start max-w-6xl mx-auto">
            {/* Left: Feature Cards */}
            <div className="space-y-8">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-indigo-50 flex items-center justify-center">
                  <Users className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">
                    Digital Queue Management
                  </h3>
                  <p className="text-slate-600">
                    Let customers join the queue with a simple QR scan. No app
                    required.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-teal-50 flex items-center justify-center">
                  <Bell className="w-6 h-6 text-teal-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">
                    Smart Notifications
                  </h3>
                  <p className="text-slate-600">
                    Automatic SMS alerts keep customers updated on their wait
                    time.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-violet-50 flex items-center justify-center">
                  <BarChart3 className="w-6 h-6 text-violet-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">
                    Analytics & Insights
                  </h3>
                  <p className="text-slate-600">
                    Track performance with detailed charts and graphs to
                    optimize your operations.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-indigo-50 flex items-center justify-center">
                  <ClipboardList className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">
                    Unified Dashboard
                  </h3>
                  <p className="text-slate-600">
                    Manage all your locations, queues, and customers in one
                    place.
                  </p>
                </div>
              </div>
            </div>

            {/* Right: Analytics Preview */}
            <div className="relative">
              <Card className="shadow-2xl border border-slate-200 bg-white rounded-2xl">
                <CardHeader className="border-b border-slate-100 p-4 md:p-6">
                  <div className="flex flex-col space-y-3 md:flex-row md:items-center md:justify-between md:space-y-0">
                    <div>
                      <CardTitle className="text-lg md:text-xl text-gray-800 flex items-center space-x-2">
                        <TrendingUp className="w-5 h-5" />
                        <span>Performance Summary</span>
                      </CardTitle>
                      <CardDescription className="text-gray-600 text-sm">
                        Track customers served, wait times, and no-shows
                      </CardDescription>
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant={chartView === "daily" ? "default" : "outline"}
                        onClick={() => setChartView("daily")}
                      >
                        Daily
                      </Button>
                      <Button
                        size="sm"
                        variant={chartView === "weekly" ? "default" : "outline"}
                        onClick={() => setChartView("weekly")}
                      >
                        Weekly
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 md:p-6">
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart
                      data={chartData}
                      margin={{ top: 8, right: 16, left: 16, bottom: 44 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tickMargin={14} height={32} />
                      <YAxis />
                      <Tooltip />
                      <Legend
                        verticalAlign="bottom"
                        align="center"
                        wrapperStyle={{ bottom: 4 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="served"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        name="Customers Served"
                      />
                      <Line
                        type="monotone"
                        dataKey="avgWait"
                        stroke="#10b981"
                        strokeWidth={2}
                        name="Avg Wait Time (min)"
                      />
                      <Line
                        type="monotone"
                        dataKey="noShows"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        name="No-Shows"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Supercharge Your Workflow */}
      <section id="features" className="py-20 px-4 bg-slate-50">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16 px-4">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-slate-900 mb-6">
              Supercharge Your Workflow with SeatPing
            </h2>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Card 1 */}
            <Card className="shadow-lg border border-slate-200 bg-white overflow-hidden">
              <div className="aspect-video bg-gradient-to-br from-indigo-100 to-indigo-50 flex items-center justify-center">
                <Clock className="w-20 h-20 text-indigo-600" />
              </div>
              <CardHeader>
                <CardTitle className="text-2xl text-slate-900">
                  Quick Setup
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-600 leading-relaxed">
                  Get started in 2 minutes. Create your account, display your QR
                  code, and start managing your queue instantly.
                </p>
              </CardContent>
            </Card>

            {/* Card 2 */}
            <Card className="shadow-lg border border-slate-200 bg-white overflow-hidden">
              <div className="aspect-video bg-gradient-to-br from-teal-100 to-teal-50 flex items-center justify-center">
                <Smartphone className="w-20 h-20 text-teal-600" />
              </div>
              <CardHeader>
                <CardTitle className="text-2xl text-slate-900">
                  Smart Notifications
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-600 leading-relaxed">
                  Customers receive automatic SMS updates. They can wait
                  anywhere, and you'll never lose a sale.
                </p>
              </CardContent>
            </Card>

            {/* Card 3 */}
            <Card className="shadow-lg border border-slate-200 bg-white overflow-hidden">
              <div className="aspect-video bg-gradient-to-br from-violet-100 to-violet-50 flex items-center justify-center">
                <ClipboardList className="w-20 h-20 text-violet-600" />
              </div>
              <CardHeader>
                <CardTitle className="text-2xl text-slate-900">
                  Real-Time Management
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-600 leading-relaxed">
                  Track every customer, send notifications with one tap, and
                  manage multiple locations from one dashboard.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20 px-4 bg-white overflow-hidden">
        <div className="container mx-auto max-w-7xl">
          <div className="text-center mb-16 px-4">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-slate-900 mb-4">
              Hear It from Those Who Matter Most
            </h2>
            <p className="text-sm sm:text-base text-slate-600 max-w-2xl mx-auto">
              See what our customers have to say about their experiences. Real
              stories, straight from the people who matter most.
            </p>
          </div>

          {/* First Row - Scrolling Right to Left */}
          <div className="mb-6 relative overflow-hidden">
            {/* Left blur edge */}
            <div className="hidden md:block absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none"></div>
            {/* Right blur edge */}
            <div className="hidden md:block absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none"></div>

            <div className="flex gap-6 animate-scroll-left-mobile md:animate-scroll-left hover:pause-animation">
              {[
                {
                  name: "John Davis",
                  role: "Owner, Bella's Bistro",
                  avatar: "JD",
                  color: "from-indigo-600 to-indigo-500",
                  text: "SeatPing keeps our team organized and focused. Queue management has never been easier!",
                  time: "2 days ago",
                },
                {
                  name: "Sarah Chen",
                  role: "Manager, Trim & Style",
                  avatar: "SC",
                  color: "from-teal-600 to-teal-500",
                  text: "Smart notifications help us hit every deadline. SeatPing is a game changer.",
                  time: "1 week ago",
                },
                {
                  name: "Mike Rodriguez",
                  role: "Operations Lead",
                  avatar: "MR",
                  color: "from-violet-600 to-violet-500",
                  text: "Managing locations is effortless with SeatPing. Our workflow is so much smoother.",
                  time: "3 days ago",
                },
                {
                  name: "Emma Wilson",
                  role: "Cafe Owner",
                  avatar: "EW",
                  color: "from-indigo-500 to-violet-500",
                  text: "The real-time updates are incredible. Our customers love the flexibility!",
                  time: "5 days ago",
                },
                {
                  name: "David Park",
                  role: "Manager, Urban Salon",
                  avatar: "DP",
                  color: "from-teal-500 to-cyan-500",
                  text: "Best queue system we've used. Setup was a breeze and it just works!",
                  time: "1 week ago",
                },
                // Duplicate for seamless loop
                {
                  name: "John Davis",
                  role: "Owner, Bella's Bistro",
                  avatar: "JD",
                  color: "from-indigo-600 to-indigo-500",
                  text: "SeatPing keeps our team organized and focused. Queue management has never been easier!",
                  time: "2 days ago",
                },
                {
                  name: "Sarah Chen",
                  role: "Manager, Trim & Style",
                  avatar: "SC",
                  color: "from-teal-600 to-teal-500",
                  text: "Smart notifications help us hit every deadline. SeatPing is a game changer.",
                  time: "1 week ago",
                },
                {
                  name: "Mike Rodriguez",
                  role: "Operations Lead",
                  avatar: "MR",
                  color: "from-violet-600 to-violet-500",
                  text: "Managing locations is effortless with SeatPing. Our workflow is so much smoother.",
                  time: "3 days ago",
                },
                {
                  name: "Emma Wilson",
                  role: "Cafe Owner",
                  avatar: "EW",
                  color: "from-indigo-500 to-violet-500",
                  text: "The real-time updates are incredible. Our customers love the flexibility!",
                  time: "5 days ago",
                },
                {
                  name: "David Park",
                  role: "Manager, Urban Salon",
                  avatar: "DP",
                  color: "from-teal-500 to-cyan-500",
                  text: "Best queue system we've used. Setup was a breeze and it just works!",
                  time: "1 week ago",
                },
              ].map((testimonial, idx) => (
                <Card
                  key={idx}
                  className="min-w-[350px] bg-white border-slate-200 shadow-sm flex-shrink-0"
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-12 h-12 rounded-full bg-gradient-to-br ${testimonial.color} flex items-center justify-center text-white font-semibold`}
                        >
                          {testimonial.avatar}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">
                            {testimonial.name}
                          </p>
                          <p className="text-sm text-slate-500">
                            {testimonial.role}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs text-slate-400">
                        {testimonial.time}
                      </span>
                    </div>
                    <p className="text-slate-700 text-sm leading-relaxed">
                      "{testimonial.text}"
                    </p>
                    <div className="flex gap-1 mt-4">
                      {[...Array(5)].map((_, i) => (
                        <span key={i} className="text-yellow-500 text-sm">
                          ★
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Second Row - Scrolling Left to Right */}
          <div className="relative overflow-hidden">
            {/* Left blur edge */}
            <div className="hidden md:block absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none"></div>
            {/* Right blur edge */}
            <div className="hidden md:block absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none"></div>

            <div className="flex gap-6 animate-scroll-right-mobile md:animate-scroll-right hover:pause-animation">
              {[
                {
                  name: "Emily Liu",
                  role: "Director, QuickCare Clinic",
                  avatar: "EL",
                  color: "from-indigo-600 to-violet-600",
                  text: "SeatPing's dashboard gives us clarity and control. Highly recommended!",
                  time: "4 days ago",
                },
                {
                  name: "Alex Turner",
                  role: "Founder, Urban Cuts",
                  avatar: "AT",
                  color: "from-indigo-500 to-violet-500",
                  text: "The UI is clean and intuitive. SeatPing makes queue management simple.",
                  time: "1 week ago",
                },
                {
                  name: "Rachel Park",
                  role: "Owner, Nail Lounge",
                  avatar: "RP",
                  color: "from-teal-500 to-cyan-500",
                  text: "SeatPing's smart notifications save me hours every week. Love it!",
                  time: "6 days ago",
                },
                {
                  name: "Tom Anderson",
                  role: "Restaurant Manager",
                  avatar: "TA",
                  color: "from-violet-600 to-indigo-600",
                  text: "We've reduced wait complaints by 80%. Game-changing for our business!",
                  time: "2 weeks ago",
                },
                {
                  name: "Lisa Martinez",
                  role: "Spa Director",
                  avatar: "LM",
                  color: "from-teal-600 to-cyan-600",
                  text: "Customer satisfaction through the roof! Best investment we've made.",
                  time: "3 days ago",
                },
                // Duplicate for seamless loop
                {
                  name: "Emily Liu",
                  role: "Director, QuickCare Clinic",
                  avatar: "EL",
                  color: "from-indigo-600 to-violet-600",
                  text: "SeatPing's dashboard gives us clarity and control. Highly recommended!",
                  time: "4 days ago",
                },
                {
                  name: "Alex Turner",
                  role: "Founder, Urban Cuts",
                  avatar: "AT",
                  color: "from-indigo-500 to-violet-500",
                  text: "The UI is clean and intuitive. SeatPing makes queue management simple.",
                  time: "1 week ago",
                },
                {
                  name: "Rachel Park",
                  role: "Owner, Nail Lounge",
                  avatar: "RP",
                  color: "from-teal-500 to-cyan-500",
                  text: "SeatPing's smart notifications save me hours every week. Love it!",
                  time: "6 days ago",
                },
                {
                  name: "Tom Anderson",
                  role: "Restaurant Manager",
                  avatar: "TA",
                  color: "from-violet-600 to-indigo-600",
                  text: "We've reduced wait complaints by 80%. Game-changing for our business!",
                  time: "2 weeks ago",
                },
                {
                  name: "Lisa Martinez",
                  role: "Spa Director",
                  avatar: "LM",
                  color: "from-teal-600 to-cyan-600",
                  text: "Customer satisfaction through the roof! Best investment we've made.",
                  time: "3 days ago",
                },
              ].map((testimonial, idx) => (
                <Card
                  key={idx}
                  className="min-w-[350px] bg-white border-slate-200 shadow-sm flex-shrink-0"
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-12 h-12 rounded-full bg-gradient-to-br ${testimonial.color} flex items-center justify-center text-white font-semibold`}
                        >
                          {testimonial.avatar}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">
                            {testimonial.name}
                          </p>
                          <p className="text-sm text-slate-500">
                            {testimonial.role}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs text-slate-400">
                        {testimonial.time}
                      </span>
                    </div>
                    <p className="text-slate-700 text-sm leading-relaxed">
                      "{testimonial.text}"
                    </p>
                    <div className="flex gap-1 mt-4">
                      {[...Array(5)].map((_, i) => (
                        <span key={i} className="text-yellow-500 text-sm">
                          ★
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4 bg-slate-50">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16 px-4">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-slate-900 mb-6">
              Simple, Flexible Pricing for SeatPing
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-slate-600">
              SeatPing helps businesses manage queues effortlessly. Choose a
              plan and boost your productivity.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Starter Plan */}
            <Card className="shadow-lg border border-slate-200 bg-white flex flex-col">
              <CardHeader className="text-center pb-8 pt-8">
                <CardTitle className="text-2xl text-slate-900 mb-4">
                  Starter
                </CardTitle>
                <div className="mb-2">
                  <span className="text-5xl font-semibold text-slate-900">
                    $19
                  </span>
                  <span className="text-slate-500"> / mo</span>
                </div>
                <p className="text-sm text-slate-500">Per user</p>
              </CardHeader>
              <CardContent className="space-y-6 flex-1 flex flex-col">
                <div className="space-y-4 flex-1">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-teal-600 flex-shrink-0" />
                    <span className="text-slate-700">1 Location</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-teal-600 flex-shrink-0" />
                    <span className="text-slate-700">300 SMS/Month</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-teal-600 flex-shrink-0" />
                    <span className="text-slate-700">300 Customers/Month</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-teal-600 flex-shrink-0" />
                    <span className="text-slate-700">Email Support</span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full border-slate-300 hover:bg-slate-50"
                  size="lg"
                  asChild
                >
                  <Link to="/signup">Get Started</Link>
                </Button>
              </CardContent>
            </Card>

            {/* Professional Plan - Popular */}
            <Card className="shadow-xl border-2 border-indigo-200 bg-white relative flex flex-col">
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-0 px-4 py-1">
                Popular
              </Badge>
              <CardHeader className="text-center pb-8 pt-8">
                <CardTitle className="text-2xl text-slate-900 mb-4">
                  Professional
                </CardTitle>
                <div className="mb-2">
                  <span className="text-5xl font-semibold text-slate-900">
                    $49
                  </span>
                  <span className="text-slate-500"> / mo</span>
                </div>
                <p className="text-sm text-slate-500">Per user</p>
              </CardHeader>
              <CardContent className="space-y-6 flex-1 flex flex-col">
                <div className="space-y-4 flex-1">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-teal-600 flex-shrink-0" />
                    <span className="text-slate-700">All Free Features</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-teal-600 flex-shrink-0" />
                    <span className="text-slate-700">3 Locations</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-teal-600 flex-shrink-0" />
                    <span className="text-slate-700">
                      600 SMS/Month per location
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-teal-600 flex-shrink-0" />
                    <span className="text-slate-700">
                      600 Customers/Month per location
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-teal-600 flex-shrink-0" />
                    <span className="text-slate-700">Priority Support</span>
                  </div>
                </div>

                <Button
                  className="w-full bg-slate-900 hover:bg-slate-800"
                  size="lg"
                  asChild
                >
                  <Link to="/signup">Get Started</Link>
                </Button>
              </CardContent>
            </Card>

            {/* Custom Plan */}
            <Card className="shadow-lg border border-slate-200 bg-white flex flex-col">
              <CardHeader className="text-center pb-8 pt-8">
                <CardTitle className="text-2xl text-slate-900 mb-4">
                  Business
                </CardTitle>
                <div className="mb-2">
                  <span className="text-5xl font-semibold text-slate-900">
                    Custom
                  </span>
                </div>
                <p className="text-sm text-slate-500">Per user</p>
              </CardHeader>
              <CardContent className="space-y-6 flex-1 flex flex-col">
                <div className="space-y-4 flex-1">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-teal-600 flex-shrink-0" />
                    <span className="text-slate-700">All Pro Features</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-teal-600 flex-shrink-0" />
                    <span className="text-slate-700">Unlimited Locations</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-teal-600 flex-shrink-0" />
                    <span className="text-slate-700">Custom SMS Credits</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-teal-600 flex-shrink-0" />
                    <span className="text-slate-700">Dedicated Support</span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full border-slate-300 hover:bg-slate-50"
                  size="lg"
                  asChild
                >
                  <Link to="/sales">Contact Sales</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center">
          <div className="max-w-3xl mx-auto space-y-8 px-4">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-slate-900">
              Ready to Hold Every Walk-In?
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-slate-600">
              Start your free trial today. No credit card required.
            </p>
            <div className="flex justify-center">
              <Button
                size="lg"
                className="text-sm sm:text-base px-6 sm:px-8 bg-slate-900 hover:bg-slate-800"
                asChild
              >
                <Link to="/signup">Get Started Free</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
};

export default LandingPage;
